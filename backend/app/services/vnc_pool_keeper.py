"""VNC pool keeper — keep one container alive per logged_in profile.

Why: containers were vanishing on their own (renderer crash, supervisord
exit, mystery `docker rm` from a code path we haven't pinned down yet).
When the pool shrinks to 0, every queued job retries through a 60s cold
spawn — partner-visible 5+ minute latencies even on healthy systems.

Strategy: every KEEPER_INTERVAL_SEC, list profiles whose status is
``logged_in`` and whose ``active_jobs`` is 0 (so we don't fight the
worker for a slot mid-CDP). For each, check ``vnc_manager.get_for_profile``;
if the container is missing OR not running, call ``start_for_profile`` to
respawn. Calls are serialised by the spawn lock in vnc_manager so we
don't race the worker's own on-demand spawn path.

This is a defence-in-depth backstop. The real fixes still live in:
  - vnc_manager._start_locked (restart-in-place on exited containers)
  - vnc_cdp_watchdog (restart on CDP black-hole)
  - Chromium heap bump in launch-chromium.sh

But empirically containers still go missing now and then, and a
self-healing pool is far less stressful than chasing every disappearance.
"""
from __future__ import annotations

import asyncio
import logging
import os

from sqlalchemy import create_engine, text

from app.browser import vnc_manager
from app.core.config import settings

log = logging.getLogger("vnc_pool_keeper")
log.setLevel(logging.INFO)

KEEPER_INTERVAL_SEC = int(os.environ.get("VNC_POOL_KEEPER_INTERVAL", "60"))
PROVIDER_URL = os.environ.get("VNC_POOL_KEEPER_URL", "https://grok.com/")


_engine_singleton = None


def _engine():
    global _engine_singleton
    if _engine_singleton is None:
        dsn = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
        _engine_singleton = create_engine(dsn, pool_pre_ping=True, pool_size=1, max_overflow=0)
    return _engine_singleton


def _pick_targets() -> list[tuple[str, str, str]]:
    """Return [(profile_id, profile_path, name)] eligible for keep-alive.

    Eligibility = status='logged_in' AND active_jobs=0 AND profile_path set.
    Skipping active_jobs>0 so we don't try to respawn a container the
    worker is currently driving.
    """
    sql = text("""
        SELECT id::text, profile_path, name
        FROM profiles
        WHERE status = 'logged_in'
          AND profile_path IS NOT NULL
          AND active_jobs = 0
          AND provider = 'grok'
        ORDER BY name
    """)
    with _engine().connect() as conn:
        rows = conn.execute(sql).all()
    return [(r[0], r[1], r[2]) for r in rows]


def _ensure_one(profile_id: str, profile_path: str, name: str) -> str:
    """Ensure a VNC container exists+running for this profile. Returns the
    action taken ('alive' / 'respawned' / 'failed: <reason>') for the log."""
    info = vnc_manager.get_for_profile(profile_id)
    if info and info.get("running"):
        return "alive"
    try:
        vnc_manager.start_for_profile(profile_id, profile_path, PROVIDER_URL)
        return "respawned"
    except Exception as exc:  # noqa: BLE001
        return f"failed: {type(exc).__name__}: {str(exc)[:120]}"


async def _tick() -> None:
    targets = await asyncio.to_thread(_pick_targets)
    if not targets:
        return
    actions: dict[str, int] = {"alive": 0, "respawned": 0, "failed": 0}
    for pid, ppath, name in targets:
        result = await asyncio.to_thread(_ensure_one, pid, ppath, name)
        if result == "alive":
            actions["alive"] += 1
        elif result == "respawned":
            actions["respawned"] += 1
            log.info("pool_keeper respawned %s (%s)", name, pid[:8])
        else:
            actions["failed"] += 1
            log.warning("pool_keeper could not respawn %s (%s): %s",
                        name, pid[:8], result.removeprefix("failed: "))
    if actions["respawned"] or actions["failed"]:
        log.info(
            "pool_keeper tick — alive=%d respawned=%d failed=%d",
            actions["alive"], actions["respawned"], actions["failed"],
        )


async def keeper_loop() -> None:
    """Long-running background task. Spawn from app lifespan."""
    log.info(
        "vnc_pool_keeper started — interval=%ds, url=%s",
        KEEPER_INTERVAL_SEC, PROVIDER_URL,
    )
    while True:
        try:
            await _tick()
        except Exception as exc:  # noqa: BLE001
            log.exception("pool_keeper tick failed: %s", exc)
        await asyncio.sleep(KEEPER_INTERVAL_SEC)
