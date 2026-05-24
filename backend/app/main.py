from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.http_client import close_http
from app.core.module_registry import register_all
from app.core.monitoring import init_sentry
from app.modules.entitlements.service import seed_default_plans

init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic is the source of truth for the schema (see `alembic/versions/`).
    # We used to call Base.metadata.create_all here, but that races with
    # alembic — new model columns end up auto-created via SQLAlchemy on boot,
    # then the matching migration fails with "table already exists" / "column
    # already exists". Boot now leaves DDL alone; deploy must run
    # `alembic upgrade head` separately (handled by the deploy script /
    # systemd unit). Tests can still call create_all explicitly via fixtures.
    async with SessionLocal() as db:
        await seed_default_plans(db)

    # Resync the VNC map on startup. Docker IPAM reassigns container IPs
    # after a host reboot, so any nginx map written before the reboot
    # points at the wrong upstream → /vnc/* returns 502. Refreshing here
    # closes that gap without waiting for the next start-vnc-session call.
    # Best-effort: silent skip when docker.sock isn't mounted (e.g. unit
    # tests).
    try:
        from app.services.nginx_sync import refresh_vnc_map
        refresh_vnc_map()
    except Exception:  # noqa: BLE001 — startup must never block on this
        pass

    # Subscribe to docker events so any grokflow-vnc-* container start /
    # die / destroy triggers an immediate map refresh. This is the
    # tightest defence-in-depth layer — without it, a docker-managed
    # restart (eg. `restart: unless-stopped` recovering a crashed VNC)
    # leaves the map stale for up to 15s until the periodic loop tick.
    # Best-effort: failure here doesn't block startup.
    import asyncio
    vnc_events_task: asyncio.Task | None = None
    try:
        from app.services.vnc_event_listener import listen_forever
        vnc_events_task = asyncio.create_task(listen_forever())
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] vnc event listener failed to start: {exc}", flush=True)

    # Periodic Chromium-tab GC for VNC containers. After each Grok job
    # the page navigates to /project/<id>?chat=<chat_id>; the per-job
    # finally block closes the worker's tab, but manual VNC sessions
    # leave tabs the worker never tracked. This loop sweeps every 5min.
    tab_gc_task: asyncio.Task | None = None
    try:
        from app.services.vnc_tab_gc import tab_gc_loop
        tab_gc_task = asyncio.create_task(tab_gc_loop())
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] vnc tab gc failed to start: {exc}", flush=True)

    # CDP health watchdog — auto-restart any VNC container whose
    # Chromium has stopped responding to /json/version (renderer crash,
    # DevTools handshake stuck, etc.). Without this loop, partner-facing
    # jobs hit `[network_error] CDP discovery` and an admin had to
    # manually click 'Reset CDP' to recover.
    cdp_watchdog_task: asyncio.Task | None = None
    try:
        from app.services.vnc_cdp_watchdog import cdp_watchdog_loop
        cdp_watchdog_task = asyncio.create_task(cdp_watchdog_loop())
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] vnc cdp watchdog failed to start: {exc}", flush=True)

    # Profile re-login watchdog — periodically probes profiles stuck in
    # `need_login` with a headless Playwright visit. If Grok still loads
    # cleanly (cookies live, no CF challenge), promote back to logged_in
    # so the pool can use it without an admin manually clicking Auto-login.
    relogin_watchdog_task: asyncio.Task | None = None
    try:
        from app.services.profile_relogin_watchdog import relogin_watchdog_loop
        relogin_watchdog_task = asyncio.create_task(relogin_watchdog_loop())
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] profile relogin watchdog failed to start: {exc}", flush=True)

    # VNC pool keeper — every 60s respawn missing/dead VNC containers
    # for profiles that should be logged_in. Defence in depth against
    # the still-unsolved 'container silently vanishes' bug — instead of
    # chasing every disappearance, keep the pool topped up so the
    # worker never starves.
    pool_keeper_task: asyncio.Task | None = None
    try:
        from app.services.vnc_pool_keeper import keeper_loop
        pool_keeper_task = asyncio.create_task(keeper_loop())
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] vnc pool keeper failed to start: {exc}", flush=True)

    # Security check: profile directory permissions. Chromium cookies
    # store on Linux không encrypted natively → ai có read access tới
    # browser_profiles/ là hijack được Grok account. Tối thiểu enforce
    # 0o700 trên parent dir + warn nếu world-readable.
    try:
        from pathlib import Path
        base = Path(settings.PROFILE_BASE_PATH).resolve()
        if base.exists():
            mode = base.stat().st_mode & 0o777
            if mode & 0o077:
                print(
                    f"[startup] ⚠ PROFILE_BASE_PATH {base} có permissions {oct(mode)} "
                    f"(world/group readable). Đang chmod 700 — khuyến nghị LUKS volume.",
                    flush=True,
                )
                base.chmod(0o700)
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] profile perm check failed: {exc}", flush=True)

    yield
    # On shutdown: stop background tasks + drain the shared httpx pool.
    for t in (vnc_events_task, tab_gc_task, cdp_watchdog_task, relogin_watchdog_task, pool_keeper_task):
        if t is None:
            continue
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
    await close_http()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.5.0",
    lifespan=lifespan,
    debug=settings.APP_DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.APP_ENV, "version": app.version}


# Mount every feature module's router via the registry. See
# `app/core/module_registry.py` for the manifest contract and the
# canonical module list.
register_all(app)
