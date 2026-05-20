"""Per-VNC Chromium CDP health watchdog.

The kasmweb VNC containers run a single Chromium instance that's
shared by several concurrent worker tasks (CDP `connect_over_cdp`).
Under burst load, Chromium occasionally:

  - emits empty body for /json/version (DevTools handshake mid-something)
  - returns 5xx until the in-flight tab GC settles
  - hard-crashes the renderer leaving the container 'healthy' to
    Docker but with a dead Chromium process inside

All three present to workers as `[network_error] CDP discovery:
Expecting value: line 1 column 1 (char 0)` and cancel the job.

This loop runs in the backend lifespan and:
  1. Probes /json/version on every `grokflow-vnc-*` container every
     `VNC_CDP_PROBE_SEC` seconds (default 60).
  2. After `VNC_CDP_FAILS_BEFORE_RESTART` consecutive bad probes
     (default 3 → ~3 min unhealthy) it `docker restart`s the
     container, resets the profile's status to `need_login`, and
     refreshes the nginx VNC map.
  3. Logs every transition (ok→bad, bad→worse, restart) so operators
     can see the recovery trail without ssh'ing in.

The `Reset CDP` button is still useful for instant manual override —
this loop is the autonomous backstop that admins shouldn't have to
think about.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import defaultdict


_PROBE_INTERVAL_SEC = int(os.environ.get("VNC_CDP_PROBE_SEC", "60"))
# Bumped from 3 → 15 default: 3 probes (3 min) was killing VNCs through
# transient blips (page navigation between tabs, Cloudflare interstitial
# JS pegging Chromium for 60-90s, etc.). 15 = 15 min tolerance before we
# restart, which is long enough that a real renderer crash still gets
# recovered but a healthy-but-busy Chromium isn't bounced.
_FAILS_BEFORE_RESTART = int(os.environ.get("VNC_CDP_FAILS_BEFORE_RESTART", "15"))
_PROBE_TIMEOUT_SEC = int(os.environ.get("VNC_CDP_PROBE_TIMEOUT_SEC", "5"))
# When True, restarting a VNC also flips its profile to need_login.
# Default False now: profile.error_message changing under the admin's
# feet (from "logged_in" → "CDP watchdog: container restarted") was
# pulling the profile out of the pool even when cookies on the /config
# volume were still valid — the auto-relogin watchdog (10-min loop)
# was then having to flip it back, leaving a window where jobs failed.
# Operators can re-enable by setting VNC_CDP_FLIP_STATUS=1.
_FLIP_STATUS_ON_RESTART = os.environ.get("VNC_CDP_FLIP_STATUS", "0") == "1"


async def cdp_watchdog_loop() -> None:
    """Long-running background task. Spawn from app lifespan."""
    print(
        f"[cdp-watchdog] started, probe every {_PROBE_INTERVAL_SEC}s, "
        f"restart after {_FAILS_BEFORE_RESTART} consecutive failures",
        flush=True,
    )

    # Track consecutive failures per container name. Reset on healthy probe.
    fail_count: dict[str, int] = defaultdict(int)
    last_restart_at: dict[str, float] = {}

    while True:
        try:
            await asyncio.to_thread(_one_cycle, fail_count, last_restart_at)
        except Exception as exc:  # noqa: BLE001
            print(f"[cdp-watchdog] cycle err: {type(exc).__name__}: {exc}", flush=True)
        await asyncio.sleep(_PROBE_INTERVAL_SEC)


def _one_cycle(
    fail_count: dict[str, int],
    last_restart_at: dict[str, float],
) -> None:
    """Synchronous probe pass — runs in to_thread to keep the event loop free."""
    try:
        import docker
        client = docker.from_env()
    except Exception:
        return

    for c in client.containers.list(filters={"name": "grokflow-vnc-"}):
        if not c.name.startswith("grokflow-vnc-"):
            continue

        # Don't probe a container we just restarted — Chromium needs
        # ~15s to fully boot inside the VNC container.
        last = last_restart_at.get(c.name, 0.0)
        if time.monotonic() - last < 20:
            continue

        healthy = _probe_cdp(c)
        if healthy:
            if fail_count[c.name]:
                print(f"[cdp-watchdog] {c.name} recovered (was {fail_count[c.name]}/{_FAILS_BEFORE_RESTART})", flush=True)
            fail_count[c.name] = 0
            continue

        fail_count[c.name] += 1
        print(
            f"[cdp-watchdog] {c.name} CDP probe FAIL "
            f"({fail_count[c.name]}/{_FAILS_BEFORE_RESTART})",
            flush=True,
        )
        if fail_count[c.name] < _FAILS_BEFORE_RESTART:
            continue

        # Threshold reached → restart.
        try:
            print(f"[cdp-watchdog] {c.name} restarting after {_FAILS_BEFORE_RESTART} fails", flush=True)
            c.restart(timeout=10)
            last_restart_at[c.name] = time.monotonic()
            fail_count[c.name] = 0
            # Reset profile.status so worker pool stops picking this
            # container until admin / next Auto-login marks it logged_in.
            # Skipped by default — see _FLIP_STATUS_ON_RESTART above.
            # The auto-relogin watchdog will probe the restarted container
            # within 10 min and either confirm logged_in or stamp need_login.
            if _FLIP_STATUS_ON_RESTART:
                _reset_profile_status_for(c.name)
            # Drop stale entry from the nginx map.
            try:
                from app.services.nginx_sync import refresh_vnc_map
                refresh_vnc_map()
            except Exception as exc:  # noqa: BLE001
                print(f"[cdp-watchdog] map refresh err: {exc}", flush=True)
            print(f"[cdp-watchdog] {c.name} restart complete", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[cdp-watchdog] {c.name} restart FAILED: {exc}", flush=True)


def _probe_cdp(container) -> bool:
    """Return True iff /json/version inside container returns valid JSON
    with a webSocketDebuggerUrl. False on empty body, 5xx, timeout, parse
    error — any 'transient' state that workers hit.
    """
    try:
        res = container.exec_run(
            cmd=["sh", "-c", "wget -qO- --timeout=5 http://localhost:9222/json/version 2>/dev/null"],
        )
        if res.exit_code != 0 or not res.output:
            return False
        data = json.loads(res.output.decode("utf-8", errors="replace"))
        return bool(data.get("webSocketDebuggerUrl"))
    except Exception:  # noqa: BLE001
        return False


def _reset_profile_status_for(container_name: str) -> None:
    """Map `grokflow-vnc-<short_id>` back to a profile id and flip its
    status to 'need_login'. The short_id is the first 12 hex of the
    profile's UUID — we match by prefix.

    Uses SQLAlchemy sync engine over psycopg2 (already in the backend's
    deps) so this helper can run in `asyncio.to_thread` without
    fighting the async SessionLocal that lives on the event loop.
    """
    short = container_name.removeprefix("grokflow-vnc-")
    if not short:
        return

    try:
        from sqlalchemy import create_engine, text
        from app.core.config import settings
        # Convert the async DSN to a sync one — same DB, different driver.
        dsn = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
        engine = create_engine(dsn, pool_pre_ping=True, pool_size=1, max_overflow=0)
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE profiles
                       SET status = 'need_login',
                           active_jobs = 0,
                           active_video_jobs = 0,
                           error_message = 'CDP watchdog: container restarted'
                     WHERE provider = 'grok'
                       AND REPLACE(id::text, '-', '') LIKE :prefix
                    """
                ),
                {"prefix": short + "%"},
            )
        engine.dispose()
    except Exception as exc:  # noqa: BLE001
        print(f"[cdp-watchdog] profile status reset err: {exc}", flush=True)
