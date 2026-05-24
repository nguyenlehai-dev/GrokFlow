"""Periodic re-login watchdog for Grok profiles.

Background: profiles transition to ``need_login`` when the worker sees
a Cloudflare challenge / login redirect mid-job. The cookies in the
profile may still be valid — CF challenges are stateless and clear by
themselves after a few minutes once the egress IP cools down. Without
this watchdog the admin has to manually open VNC and click around to
flip status back to ``logged_in``.

What the loop does every WATCHDOG_INTERVAL_SEC:

    1. Pick up to BATCH_SIZE profiles where status='need_login'
       AND profile_path is set (cookies imported at least once).
    2. For each, run ``profile_manager.check_session(path, provider)``
       — a headless 15s Playwright probe to provider home.
    3. If the probe returns (True, None) → flip status to
       ``logged_in`` + clear last_error.
    4. If False → leave alone (next pass will retry, OR admin must
       VNC + re-auth). No exponential backoff yet — a profile that
       can't recover sits in ``need_login`` forever until human acts.

Safety: we skip profiles in `running_job` or with `active_jobs > 0`.
Picking a profile that's currently servicing a request via the worker
would tear its Chromium state during the check.

Run as a separate background task spawned from ``app.main`` lifespan
— same pattern as ``vnc_cdp_watchdog``.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, text

from app.browser import profile_manager
from app.core.config import settings

log = logging.getLogger("profile_relogin")
log.setLevel(logging.INFO)

WATCHDOG_INTERVAL_SEC = int(os.getenv("PROFILE_RELOGIN_INTERVAL", "600"))  # 10 min
BATCH_SIZE = int(os.getenv("PROFILE_RELOGIN_BATCH", "5"))
PROBE_TIMEOUT_MS = int(os.getenv("PROFILE_RELOGIN_TIMEOUT_MS", "15000"))


def _engine():
    dsn = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
    return create_engine(dsn, pool_pre_ping=True, pool_size=1, max_overflow=0)


_engine_singleton = None


def _get_engine():
    global _engine_singleton
    if _engine_singleton is None:
        _engine_singleton = _engine()
    return _engine_singleton


def _pick_candidates() -> list[tuple[str, str, str]]:
    """Return [(profile_id, profile_path, provider)] for profiles eligible
    for an auto-relogin probe. Filters out anything currently busy."""
    sql = text("""
        SELECT id::text, profile_path, provider
        FROM profiles
        WHERE status = 'need_login'
          AND profile_path IS NOT NULL
          AND active_jobs = 0
          AND active_video_jobs = 0
        ORDER BY COALESCE(last_used_at, created_at) ASC
        LIMIT :batch
    """)
    with _get_engine().connect() as conn:
        rows = conn.execute(sql, {"batch": BATCH_SIZE}).all()
    return [(r[0], r[1], r[2]) for r in rows]


def _promote(profile_id: str) -> None:
    """Flip profile back to ``logged_in`` — cookies still valid, the
    need_login state was a stale Cloudflare-during-job blip."""
    sql = text("""
        UPDATE profiles
        SET status = 'logged_in',
            updated_at = :now
        WHERE id = :pid
          AND status = 'need_login'
    """)
    with _get_engine().begin() as conn:
        conn.execute(sql, {"pid": profile_id, "now": datetime.now(timezone.utc)})
    log.info("relogin_promote profile=%s", profile_id)


def _stamp_failure(profile_id: str, error: str | None) -> None:
    """No-op stamp — Profile model doesn't yet carry last_session_check_at
    or last_error columns. Errors logged to stdout instead. Future polish:
    add those columns via alembic + persist diagnostic timestamps."""
    log.info("relogin_failed profile=%s err=%s", profile_id, (error or "")[:200])


async def _check_one(profile_id: str, profile_path: str, provider: str) -> None:
    try:
        ok, err = await profile_manager.check_session(
            profile_path, provider, timeout_ms=PROBE_TIMEOUT_MS,
        )
    except Exception as exc:  # noqa: BLE001
        ok, err = False, f"watchdog exc: {type(exc).__name__}: {exc}"

    if ok:
        await asyncio.to_thread(_promote, profile_id)
    else:
        await asyncio.to_thread(_stamp_failure, profile_id, err)


async def _tick() -> None:
    candidates = await asyncio.to_thread(_pick_candidates)
    if not candidates:
        return
    log.info("relogin_tick candidates=%d", len(candidates))
    # Probe in parallel — Playwright contexts are independent, and N=5
    # concurrent headless Chromiums fit comfortably on a 4GB VPS.
    await asyncio.gather(
        *(_check_one(pid, path, prov) for pid, path, prov in candidates),
        return_exceptions=True,
    )


async def relogin_watchdog_loop() -> None:
    """Run forever. Sleep WATCHDOG_INTERVAL_SEC between ticks."""
    log.info("profile_relogin_watchdog started — interval=%ds batch=%d",
             WATCHDOG_INTERVAL_SEC, BATCH_SIZE)
    while True:
        try:
            await _tick()
        except Exception as exc:  # noqa: BLE001
            log.exception("relogin_watchdog tick failed: %s", exc)
        await asyncio.sleep(WATCHDOG_INTERVAL_SEC)
