"""Stop VNC containers for profiles idle longer than threshold to free RAM.

Run periodically (cron every hour or compose service with sleep loop):
    python -m app.workers.idle_cleanup [--idle-hours 6]

Effects:
- Find profiles with active_jobs == 0 AND last_used_at older than threshold.
- Call vnc_manager.stop_for_profile() on each.
- Set profile.status = need_login (admin must Auto-login again next time).
"""

import argparse
import asyncio
import os
from datetime import datetime, timedelta, timezone

from pathlib import Path

from sqlalchemy import delete, select

from app.browser import vnc_manager
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import File as FileModel, Job, JobLog, Profile


async def cleanup(idle_hours: float) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=idle_hours)
    stopped = 0
    async with SessionLocal() as db:
        # Reap orphan VNC containers (profile deleted but container still running).
        all_pids = {str(p.id) for p in (
            await db.execute(select(Profile))
        ).scalars().all()}
        try:
            reaped = vnc_manager.reap_orphans(all_pids)
            if reaped:
                print(f"[idle-cleanup] reaped orphan VNC: {reaped}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[idle-cleanup] orphan reap failed: {exc}", flush=True)

        # JobLog TTL: keep ~30 days. Logs of long-finished jobs are debug-only.
        log_ttl_days = float(os.environ.get("JOBLOG_TTL_DAYS", "30"))
        log_cutoff = datetime.now(timezone.utc) - timedelta(days=log_ttl_days)
        try:
            res = await db.execute(
                delete(JobLog).where(JobLog.created_at < log_cutoff)
            )
            if res.rowcount:
                print(f"[idle-cleanup] pruned {res.rowcount} JobLog rows older than {log_ttl_days}d", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[idle-cleanup] joblog prune failed: {exc}", flush=True)
        await db.commit()

        # File TTL: delete generated/uploaded files older than N days.
        # Default 60 days — long enough for users to download, short
        # enough that the storage volume doesn't grow forever. The DB
        # row is removed too, and the on-disk blob is best-effort
        # unlinked from local storage.
        file_ttl_days = float(os.environ.get("FILE_TTL_DAYS", "60"))
        file_cutoff = datetime.now(timezone.utc) - timedelta(days=file_ttl_days)
        try:
            old_files = (await db.execute(
                select(FileModel).where(FileModel.created_at < file_cutoff)
            )).scalars().all()
            removed = 0
            bytes_freed = 0
            for f in old_files:
                # Best-effort unlink for local-storage driver only.
                if f.storage_driver == "local":
                    try:
                        path = Path(settings.LOCAL_STORAGE_PATH) / f.storage_path
                        if path.exists():
                            sz = path.stat().st_size
                            path.unlink()
                            bytes_freed += sz
                    except Exception:  # noqa: BLE001
                        pass
                await db.delete(f)
                removed += 1
            if removed:
                await db.commit()
                mb = bytes_freed / 1024 / 1024
                print(f"[idle-cleanup] pruned {removed} files older than {file_ttl_days}d ({mb:.1f} MB freed)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[idle-cleanup] file prune failed: {exc}", flush=True)

        # Profiles likely backed by a running container
        rows = (await db.execute(
            select(Profile).where(
                Profile.active_jobs == 0,
                Profile.status.in_(["logged_in", "running_job", "opening"]),
            )
        )).scalars().all()
        for p in rows:
            last = p.last_used_at or p.last_login_check_at or p.created_at
            if last and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last and last >= cutoff:
                continue
            info = vnc_manager.get_for_profile(str(p.id))
            if not info:
                continue
            print(f"[idle-cleanup] stopping {p.name} ({p.id}), last_used={last}", flush=True)
            try:
                vnc_manager.stop_for_profile(str(p.id))
                p.status = "need_login"
                p.error_message = "Auto-stopped (idle)"
                stopped += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  stop failed: {exc}", flush=True)
        if stopped:
            await db.commit()
    return stopped


async def loop_forever(interval_seconds: int, idle_hours: float) -> None:
    print(f"[idle-cleanup] loop started: every {interval_seconds}s, idle threshold {idle_hours}h", flush=True)
    while True:
        try:
            n = await cleanup(idle_hours)
            if n:
                print(f"[idle-cleanup] stopped {n} idle container(s)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[idle-cleanup] error: {exc}", flush=True)
        await asyncio.sleep(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--idle-hours", type=float,
                        default=float(os.environ.get("IDLE_CLEANUP_HOURS", "6")))
    parser.add_argument("--once", action="store_true", help="Run one pass and exit (for cron)")
    parser.add_argument("--interval", type=int,
                        default=int(os.environ.get("IDLE_CLEANUP_INTERVAL", "3600")))
    args = parser.parse_args()
    if args.once:
        n = asyncio.run(cleanup(args.idle_hours))
        print(f"stopped {n}")
    else:
        asyncio.run(loop_forever(args.interval, args.idle_hours))


if __name__ == "__main__":
    main()
