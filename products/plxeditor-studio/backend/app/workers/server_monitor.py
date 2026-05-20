"""Background health-check + alerting loop for managed servers.

Polls every active Server row over SSH on a fixed interval (default 60s),
appends a row to `server_metrics_history`, and opens / resolves rows in
`server_alerts` when thresholds trip.

Run as its own docker compose service (see `docker-compose.intranet.yml`):

    server-monitor:
      build: ./backend
      command: python -m app.workers.server_monitor
      depends_on: [postgres]

Why a separate worker (not a FastAPI background task)?
  - Probes are blocking SSH calls. Running them inline in the request
    thread would tie up the FastAPI worker for seconds at a time.
  - We want the health-check to keep ticking even when the API is
    rebooting mid-deploy.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

from croniter import CroniterBadCronError, croniter
from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.models import (
    Notification, Server, ServerAlert, ServerBackupHistory,
    ServerMetricHistory, ServerRebootHistory,
)
from app.modules.servers.services.backup_runner import run_backup
from app.modules.servers.services.metrics import probe
from app.modules.servers.services.ssh import SshConnectError, run_sudo


log = logging.getLogger("server-monitor")
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)

INTERVAL_SEC = int(os.environ.get("SERVER_MONITOR_INTERVAL", "60"))
HISTORY_RETENTION_DAYS = int(os.environ.get("SERVER_METRICS_RETENTION_DAYS", "7"))
HOUSEKEEP_EVERY = int(os.environ.get("SERVER_MONITOR_HOUSEKEEP_EVERY", "60"))  # passes


# ─── Thresholds ────────────────────────────────────────────────────────
# Tuned from the prod box load; admin can override per-environment via
# env vars later if these turn out wrong for their workload.

THRESHOLDS = {
    "ram_average_pct":   float(os.environ.get("ALERT_RAM_AVG", "85")),
    "ram_high_pct":      float(os.environ.get("ALERT_RAM_HIGH", "95")),
    "disk_average_pct":  float(os.environ.get("ALERT_DISK_AVG", "85")),
    "disk_high_pct":     float(os.environ.get("ALERT_DISK_HIGH", "95")),
    "load_warning":      float(os.environ.get("ALERT_LOAD_WARN", "8")),
    "load_high":         float(os.environ.get("ALERT_LOAD_HIGH", "16")),
    "probe_slow_ms":     int(os.environ.get("ALERT_PROBE_SLOW_MS", "8000")),
}


class _Sample(NamedTuple):
    """Result of one probe, normalised + ready to persist."""
    status: str
    cpu_pct: float | None
    ram_used: int | None
    ram_total: int | None
    disk_used: int | None
    disk_total: int | None
    load_1m: float | None
    uptime_sec: int | None
    duration_ms: int
    error: str | None


def _ram_pct(s: _Sample) -> float | None:
    if s.ram_used and s.ram_total:
        return round(s.ram_used / s.ram_total * 100, 1)
    return None


def _disk_pct(s: _Sample) -> float | None:
    if s.disk_used and s.disk_total:
        return round(s.disk_used / s.disk_total * 100, 1)
    return None


def _probe_once(server: Server) -> _Sample:
    """Run the probe + capture duration. Never raises — failures become
    a sample with status='unreachable' so the alert path can still fire."""
    started = time.monotonic()
    try:
        m = probe(server)
        ram_used = int(m.memory_used_gb * 1024**3) if m.memory_used_gb else None
        ram_total = int(m.memory_total_gb * 1024**3) if m.memory_total_gb else None
        disk_used = int(m.disk_used_gb * 1024**3) if m.disk_used_gb else None
        disk_total = int(m.disk_total_gb * 1024**3) if m.disk_total_gb else None
        # `uptime -p` doesn't give seconds. Pull from /proc/uptime instead
        # in a follow-up; for now leave None.
        return _Sample(
            status="active",
            cpu_pct=m.cpu_usage_pct,
            ram_used=ram_used,
            ram_total=ram_total,
            disk_used=disk_used,
            disk_total=disk_total,
            load_1m=None,
            uptime_sec=None,
            duration_ms=int((time.monotonic() - started) * 1000),
            error=None,
        )
    except SshConnectError as e:
        return _Sample(
            status="unreachable", cpu_pct=None,
            ram_used=None, ram_total=None,
            disk_used=None, disk_total=None,
            load_1m=None, uptime_sec=None,
            duration_ms=int((time.monotonic() - started) * 1000),
            error=str(e),
        )
    except Exception as e:  # noqa: BLE001
        return _Sample(
            status="unreachable", cpu_pct=None,
            ram_used=None, ram_total=None,
            disk_used=None, disk_total=None,
            load_1m=None, uptime_sec=None,
            duration_ms=int((time.monotonic() - started) * 1000),
            error=f"{type(e).__name__}: {e}",
        )


async def _open_alert(
    db, server: Server, kind: str, severity: str, message: str,
    trigger_value: str | None = None,
) -> None:
    """Insert an open ServerAlert row if there isn't already one of the
    same kind active. Also emits an in-app Notification for the
    super_admin(s) so the bell icon rings."""
    existing = (await db.execute(
        select(ServerAlert).where(
            ServerAlert.server_id == server.id,
            ServerAlert.kind == kind,
            ServerAlert.resolved_at.is_(None),
        )
    )).scalar_one_or_none()
    if existing is not None:
        return  # already open — don't double-spam

    alert = ServerAlert(
        id=uuid.uuid4(),
        server_id=server.id,
        kind=kind,
        severity=severity,
        message=message,
        trigger_value=trigger_value,
    )
    db.add(alert)

    # Tier-style severity icon prefix for the bell dropdown.
    icon = {"disaster": "🚨", "high": "🔴", "average": "🟠",
            "warning": "🟡", "information": "ℹ️"}.get(severity, "•")
    from app.models import User
    super_ids = [
        u.id for u in (await db.execute(
            select(User).where(User.role == "super_admin")
        )).scalars().all()
    ]
    for uid in super_ids:
        db.add(Notification(
            user_id=uid,
            kind="server_alert",
            title=f"{icon} {server.label}: {kind}",
            body=message,
            target_url=f"/servers/{server.id}",
            severity=severity if severity in ("high", "warning", "info") else "warning",
        ))


async def _resolve_alert(db, server: Server, kind: str) -> None:
    """Close any open alert of `kind` for this server with resolved_at=now."""
    rows = (await db.execute(
        select(ServerAlert).where(
            ServerAlert.server_id == server.id,
            ServerAlert.kind == kind,
            ServerAlert.resolved_at.is_(None),
        )
    )).scalars().all()
    now = datetime.now(timezone.utc)
    for r in rows:
        r.resolved_at = now


async def _check_thresholds(db, server: Server, s: _Sample) -> None:
    """Open / resolve alerts based on the sample. Each rule is independent
    so a box can be in multiple alert states at once (e.g. RAM critical AND
    disk critical)."""
    # 1. Reachability
    if s.status == "unreachable":
        await _open_alert(
            db, server, "ssh_unreachable", "disaster",
            f"SSH probe failed: {s.error or 'no response'}",
            trigger_value=str(s.duration_ms),
        )
    else:
        await _resolve_alert(db, server, "ssh_unreachable")

    # 2. RAM
    ram_pct = _ram_pct(s)
    if ram_pct is not None:
        if ram_pct >= THRESHOLDS["ram_high_pct"]:
            await _open_alert(
                db, server, "ram_critical", "high",
                f"RAM ở mức nguy hiểm: {ram_pct}% (>= {THRESHOLDS['ram_high_pct']}%)",
                trigger_value=str(ram_pct),
            )
            await _resolve_alert(db, server, "ram_warning")  # subsume
        elif ram_pct >= THRESHOLDS["ram_average_pct"]:
            await _open_alert(
                db, server, "ram_warning", "average",
                f"RAM cao: {ram_pct}% (>= {THRESHOLDS['ram_average_pct']}%)",
                trigger_value=str(ram_pct),
            )
            await _resolve_alert(db, server, "ram_critical")
        else:
            await _resolve_alert(db, server, "ram_warning")
            await _resolve_alert(db, server, "ram_critical")

    # 3. Disk
    disk_pct = _disk_pct(s)
    if disk_pct is not None:
        if disk_pct >= THRESHOLDS["disk_high_pct"]:
            await _open_alert(
                db, server, "disk_critical", "high",
                f"Disk gần đầy: {disk_pct}% (>= {THRESHOLDS['disk_high_pct']}%)",
                trigger_value=str(disk_pct),
            )
            await _resolve_alert(db, server, "disk_warning")
        elif disk_pct >= THRESHOLDS["disk_average_pct"]:
            await _open_alert(
                db, server, "disk_warning", "average",
                f"Disk cao: {disk_pct}% (>= {THRESHOLDS['disk_average_pct']}%)",
                trigger_value=str(disk_pct),
            )
            await _resolve_alert(db, server, "disk_critical")
        else:
            await _resolve_alert(db, server, "disk_warning")
            await _resolve_alert(db, server, "disk_critical")

    # 4. Probe latency (proxy for "server overloaded")
    if s.duration_ms >= THRESHOLDS["probe_slow_ms"]:
        await _open_alert(
            db, server, "probe_slow", "warning",
            f"SSH probe chậm: {s.duration_ms}ms (>= {THRESHOLDS['probe_slow_ms']}ms)",
            trigger_value=str(s.duration_ms),
        )
    else:
        await _resolve_alert(db, server, "probe_slow")


async def _process_server(server: Server) -> None:
    """One full cycle for one server: probe → persist → alert.

    `_probe_once` is blocking (paramiko opens a real TCP connection +
    waits for the remote shell). Running it on the event loop would
    serialise every server's probe. `asyncio.to_thread` pushes it to
    the default executor pool so N servers probe in parallel."""
    s = await asyncio.to_thread(_probe_once, server)
    log.debug(
        "probe %s status=%s ram=%.0f%% disk=%.0f%% dur=%dms",
        server.label, s.status,
        _ram_pct(s) or 0, _disk_pct(s) or 0, s.duration_ms,
    )
    async with SessionLocal() as db:
        db.add(ServerMetricHistory(
            server_id=server.id,
            sampled_at=datetime.now(timezone.utc),
            status=s.status,
            cpu_pct=s.cpu_pct,
            ram_used_bytes=s.ram_used,
            ram_total_bytes=s.ram_total,
            disk_used_bytes=s.disk_used,
            disk_total_bytes=s.disk_total,
            load_avg_1m=s.load_1m,
            uptime_seconds=s.uptime_sec,
            probe_duration_ms=s.duration_ms,
            error_message=s.error,
        ))
        # Refresh cached Server.status / Server.last_seen_at to match.
        fresh = await db.get(Server, server.id)
        if fresh:
            fresh.status = s.status
            if s.status == "active":
                fresh.last_seen_at = datetime.now(timezone.utc)
            await _check_thresholds(db, fresh, s)
        await db.commit()


# ─── Reboot scheduler ───────────────────────────────────────────────────


def _cron_should_fire(cron_str: str, now: datetime) -> bool:
    """True when `now` falls within the minute that the cron expression
    matches. We give a ±30s tolerance so a slightly-late loop pass still
    catches the right minute."""
    try:
        it = croniter(cron_str, now - timedelta(seconds=30))
        next_fire = it.get_next(datetime)
        # next_fire is naive UTC from croniter — make it tz-aware.
        if next_fire.tzinfo is None:
            next_fire = next_fire.replace(tzinfo=timezone.utc)
        return abs((next_fire - now).total_seconds()) <= 30
    except (CroniterBadCronError, ValueError):
        return False


def _ssh_reboot(server: Server) -> tuple[bool, str]:
    """Issue `sudo shutdown -r +1` over SSH. Returns (ok, message)."""
    try:
        res = run_sudo(server, "shutdown -r +1", timeout=15.0)
        ok = res.rc in (0, 255)  # 255 = SSH chan killed by reboot — success
        msg = (res.stderr or res.stdout or "").strip()[:300]
        return ok, msg
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


async def _maybe_fire_reboot(server: Server) -> None:
    """For one server, decide whether to auto-reboot now.

    Guards:
      • cron must match the current minute (±30s)
      • server uptime (from last_seen_at gap) ≥ reboot_min_uptime_hours
        — we use cached `last_seen_at` instead of probing again
      • no other reboot started in the last 5 minutes (avoid double-fire
        across two loop passes that span a minute boundary)"""
    if not server.reboot_schedule_cron:
        return
    now = datetime.now(timezone.utc)
    if not _cron_should_fire(server.reboot_schedule_cron, now):
        return

    async with SessionLocal() as db:
        # Re-check ServerRebootHistory inside a single transaction to
        # prevent two scheduler passes racing on the same fire.
        recent = (await db.execute(
            select(ServerRebootHistory).where(
                ServerRebootHistory.server_id == server.id,
                ServerRebootHistory.started_at >= now - timedelta(minutes=5),
            )
        )).scalars().first()
        if recent is not None:
            log.info("skip reboot %s: another reboot started at %s",
                     server.label, recent.started_at)
            return

        # Uptime gate — refuse to reboot a box that just came up.
        if server.last_seen_at:
            last_seen = server.last_seen_at
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            hours_up = (now - last_seen).total_seconds() / 3600
            # `last_seen_at` is "last successful probe", not "last boot",
            # so it's a lower bound on real uptime. Good enough for the
            # safety guard — we'd rather be conservative.
            if hours_up < server.reboot_min_uptime_hours:
                log.info("skip reboot %s: uptime %.1fh < min %dh",
                         server.label, hours_up, server.reboot_min_uptime_hours)
                return

        # Insert the history row BEFORE firing so a crash mid-SSH is still
        # visible in the audit.
        row = ServerRebootHistory(
            id=uuid.uuid4(), server_id=server.id,
            trigger="scheduled", status="running",
        )
        db.add(row)
        await db.commit()

    log.info("auto-reboot firing for %s (cron=%s)",
             server.label, server.reboot_schedule_cron)
    ok, msg = await asyncio.to_thread(_ssh_reboot, server)

    async with SessionLocal() as db:
        # Re-fetch the history row we just inserted to finalize.
        fresh = await db.get(ServerRebootHistory, row.id)
        if fresh is not None:
            fresh.status = "success" if ok else "failed"
            fresh.error_message = None if ok else msg
            fresh.finished_at = datetime.now(timezone.utc)
            await db.commit()
        # Also emit a Notification so super_admin sees the scheduled
        # reboot in the bell.
        from app.models import User
        sup_ids = [
            u.id for u in (await db.execute(
                select(User).where(User.role == "super_admin")
            )).scalars().all()
        ]
        for uid in sup_ids:
            icon = "🔄" if ok else "❌"
            db.add(Notification(
                user_id=uid, kind="server_reboot",
                title=f"{icon} {server.label}: auto-reboot",
                body=msg or ("Reboot fired" if ok else "Reboot failed"),
                target_url=f"/servers/{server.id}",
                severity="info" if ok else "warning",
            ))
        await db.commit()


# ─── Backup scheduler ──────────────────────────────────────────────────


async def _maybe_fire_backup(server: Server) -> None:
    """For one server, decide whether to run the daily backup now.

    Same shape as the reboot scheduler — cron-match check, then de-dupe
    via recent history check, then SSH-execute. Difference: backups can
    take minutes, so we run them in a thread and don't block the loop."""
    if not server.backup_schedule_cron:
        return
    now = datetime.now(timezone.utc)
    if not _cron_should_fire(server.backup_schedule_cron, now):
        return
    if not (server.backup_paths or server.backup_db_name):
        return  # No-op: nothing to backup

    async with SessionLocal() as db:
        recent = (await db.execute(
            select(ServerBackupHistory).where(
                ServerBackupHistory.server_id == server.id,
                ServerBackupHistory.started_at >= now - timedelta(minutes=5),
            )
        )).scalars().first()
        if recent is not None:
            return  # Already started this minute window
        row = ServerBackupHistory(
            id=uuid.uuid4(), server_id=server.id,
            trigger="scheduled", status="running",
        )
        db.add(row)
        await db.commit()
        row_id = row.id

    log.info("auto-backup firing for %s (cron=%s)",
             server.label, server.backup_schedule_cron)
    result = await asyncio.to_thread(run_backup, server)

    async with SessionLocal() as db:
        fresh = await db.get(ServerBackupHistory, row_id)
        if fresh is not None:
            fresh.status = "success" if result.success else "failed"
            fresh.output_path = result.output_path
            fresh.size_bytes = result.size_bytes
            fresh.error_message = None if result.success else result.message[:500]
            fresh.finished_at = datetime.now(timezone.utc)
            await db.commit()

        from app.models import User
        sup_ids = [
            u.id for u in (await db.execute(
                select(User).where(User.role == "super_admin")
            )).scalars().all()
        ]
        icon = "💾" if result.success else "❌"
        for uid in sup_ids:
            db.add(Notification(
                user_id=uid, kind="server_backup",
                title=f"{icon} {server.label}: backup",
                body=result.message[:500] or ("Backup OK" if result.success else "Backup failed"),
                target_url=f"/servers/{server.id}",
                severity="info" if result.success else "warning",
            ))
        await db.commit()


async def _housekeep() -> None:
    """Prune metrics older than `HISTORY_RETENTION_DAYS`."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=HISTORY_RETENTION_DAYS)
    async with SessionLocal() as db:
        res = await db.execute(
            delete(ServerMetricHistory).where(
                ServerMetricHistory.sampled_at < cutoff
            )
        )
        await db.commit()
        if res.rowcount:
            log.info("housekeep: pruned %d metric rows older than %s",
                     res.rowcount, cutoff.isoformat())


async def _loop_once() -> None:
    """One full pass: list active servers, probe each (concurrently)."""
    async with SessionLocal() as db:
        servers = (await db.execute(
            select(Server).where(Server.monitor_enabled == True)  # noqa: E712
        )).scalars().all()

    if not servers:
        return

    # Run probes concurrently — each _process_server awaits on
    # asyncio.to_thread(_probe_once, ...) internally so paramiko blocking
    # I/O is fanned out across the default executor pool.
    await asyncio.gather(
        *[_process_server(s) for s in servers],
        return_exceptions=True,
    )

    # Reboot scheduler runs in the same pass — same servers list, no extra
    # query. Each call is a no-op when the cron doesn't fire this minute.
    await asyncio.gather(
        *[_maybe_fire_reboot(s) for s in servers],
        return_exceptions=True,
    )

    # Backup scheduler — runs the daily tar + pg_dump when cron matches.
    # Backups can take minutes; each call wraps the SSH in to_thread so
    # the loop doesn't stall even if multiple servers backup concurrently.
    await asyncio.gather(
        *[_maybe_fire_backup(s) for s in servers],
        return_exceptions=True,
    )


async def main() -> None:
    log.info("server-monitor start interval=%ds retention=%dd", INTERVAL_SEC, HISTORY_RETENTION_DAYS)
    cycle = 0
    while True:
        cycle += 1
        started = time.monotonic()
        try:
            await _loop_once()
            if cycle % HOUSEKEEP_EVERY == 0:
                await _housekeep()
        except Exception as exc:  # noqa: BLE001
            log.exception("loop failed: %s", exc)
        elapsed = time.monotonic() - started
        sleep_for = max(1.0, INTERVAL_SEC - elapsed)
        await asyncio.sleep(sleep_for)


if __name__ == "__main__":
    asyncio.run(main())
