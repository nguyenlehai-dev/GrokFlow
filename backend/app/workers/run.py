"""Polling worker — multi-tab per profile.

Profile concurrency is gated by `active_jobs / max_concurrent_jobs` counters
(atomic UPDATE). Multiple worker iterations can hold slots on the same profile
simultaneously, each driving its own Chromium tab via Playwright.

State machine per job:
  queued → running → processing_provider → uploading_result → success
                                                            ↘ failed (terminal or retry)
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal
from app.models import Job, JobLog, Profile, User
from app.modules.files import service as files_service
from app.providers import JobInput, get_provider
from app.workers import webhook

WORKER_ID = os.environ.get("HOSTNAME", "worker") + "-" + str(os.getpid())

# Default exponential backoff (seconds). Rate-limit errors use a longer ramp.
BACKOFF_SECONDS = [30, 120, 480]
RATE_LIMIT_BACKOFF_SECONDS = [120, 600, 1800]  # 2m, 10m, 30m
TERMINAL_ERROR_CODES = {"cookie_expired", "captcha_required", "provider_blocked",
                        "unsupported_job_type"}
RUNNING_JOB_STATES = ("running", "processing_provider", "uploading_result")


async def _pick_job(db: AsyncSession, job_type_filter: str | None) -> Job | None:
    # NOTE: retry-cap enforcement lives in process_one's should_retry path —
    # we do NOT filter retry_count here, because the FINAL allowed attempt
    # has retry_count == max_retry at queue time and must still be picked up.
    # Zombie jobs (retry_count > max_retry from old bug history) are reaped
    # by _startup_recovery instead.
    now = datetime.now(timezone.utc)
    stmt = (
        select(Job)
        .where(
            Job.status == "queued",
            (Job.next_attempt_at.is_(None)) | (Job.next_attempt_at <= now),
        )
        .order_by(Job.priority.desc(), Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job_type_filter:
        stmt = stmt.where(Job.job_type == job_type_filter)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _try_acquire_slot(db: AsyncSession, profile_id: uuid.UUID) -> bool:
    """Atomically increment active_jobs if under cap. Returns True on success."""
    result = await db.execute(
        update(Profile)
        .where(
            Profile.id == profile_id,
            Profile.active_jobs < Profile.max_concurrent_jobs,
            Profile.status.in_(["logged_in", "running_job"]),
        )
        .values(
            active_jobs=Profile.active_jobs + 1,
            status="running_job",
            last_used_at=datetime.now(timezone.utc),
        )
        .returning(Profile.id)
    )
    return result.scalar_one_or_none() is not None


async def _release_slot(db: AsyncSession, profile_id: uuid.UUID,
                        new_status: str | None = None,
                        error_message: str | None = None) -> None:
    """Decrement active_jobs (clamped to 0). If counter reaches 0, set status accordingly."""
    # Decrement; if final count is 0, restore status to logged_in (or new_status).
    profile = await db.get(Profile, profile_id, with_for_update=True)
    if not profile:
        return
    profile.active_jobs = max(0, profile.active_jobs - 1)
    if profile.active_jobs == 0:
        profile.status = new_status or "logged_in"
    elif new_status and new_status != "logged_in":
        # Force terminal status (e.g. blocked/need_login) even if other slots are running
        profile.status = new_status
    if error_message is not None:
        profile.error_message = error_message
    profile.last_used_at = datetime.now(timezone.utc)


def _profile_status_after_error(error_code: str | None) -> str | None:
    if error_code in {"cookie_expired", "captcha_required"}:
        return "need_login"
    if error_code == "provider_blocked":
        return "blocked"
    return None


async def _maybe_send_webhook(db: AsyncSession, job: Job) -> None:
    user = await db.get(User, job.user_id)
    if not user or not user.webhook_url:
        return
    event = {"success": "job.success", "failed": "job.failed", "cancelled": "job.cancelled"}.get(job.status)
    if not event:
        return
    try:
        delivered = await webhook.deliver(user, job, event)
        db.add(JobLog(job_id=job.id, level="info" if delivered else "warning",
                      message=f"Webhook {event} {'delivered' if delivered else 'failed'}"))
    except Exception as exc:  # noqa: BLE001
        db.add(JobLog(job_id=job.id, level="error",
                      message=f"Webhook exception: {type(exc).__name__}: {exc}"))


async def _watch_for_cancel(job_id: uuid.UUID, target: asyncio.Task,
                            interval: int = 5) -> None:
    """Background poll: every N seconds re-read job.status. If user cancels,
    abort the running provider task. Exits cleanly when the task ends."""
    while not target.done():
        try:
            await asyncio.sleep(interval)
            if target.done():
                return
            async with SessionLocal() as db2:
                fresh = await db2.get(Job, job_id)
                if fresh and fresh.status == "cancelled":
                    target.cancel()
                    return
        except asyncio.CancelledError:
            return
        except Exception:  # noqa: BLE001
            # transient DB error — keep watching, don't tear down the run
            continue


async def process_one(db: AsyncSession, job: Job) -> None:
    # Race window: user may have hit Cancel between claim and process. The
    # claim step set status="running" but cancel() can still write "cancelled".
    # Re-read fresh state once before doing real work.
    await db.refresh(job)
    if job.status == "cancelled":
        db.add(JobLog(job_id=job.id, level="info",
                      message=f"Worker {WORKER_ID} skipped — job already cancelled"))
        await db.commit()
        return

    job.started_at = datetime.now(timezone.utc)
    db.add(JobLog(job_id=job.id, level="info",
                  message=f"Worker {WORKER_ID} picked up job (retry={job.retry_count})"))

    slot_held: uuid.UUID | None = None
    if job.profile_id:
        if await _try_acquire_slot(db, job.profile_id):
            slot_held = job.profile_id
        else:
            job.status = "queued"
            db.add(JobLog(job_id=job.id, level="warning",
                          message="Profile at capacity, requeue"))
            await db.commit()
            return

    profile: Profile | None = None
    if slot_held:
        profile = await db.get(Profile, slot_held)
    await db.commit()

    profile_terminal_status: str | None = None
    try:
        provider = get_provider(job.provider)
        job.status = "processing_provider"
        await db.commit()

        # Resolve attachments
        attachments: list = []
        opts = job.input_payload or {}
        input_id = opts.get("input_image_file_id")
        if input_id:
            from app.providers.base import InputAttachment
            from app.modules.files import service as files_service_mod
            from app.models import File as FileModel
            try:
                f = await db.get(FileModel, uuid.UUID(input_id))
                if f and f.user_id == job.user_id:
                    data = await files_service_mod.read_file_bytes(f)
                    attachments.append(InputAttachment(
                        name=f.file_name, mime=f.mime_type or "image/png", bytes=data,
                    ))
                    db.add(JobLog(job_id=job.id, level="info",
                                  message=f"Attached input {f.file_name} ({len(data)} bytes)"))
            except Exception as exc:  # noqa: BLE001
                db.add(JobLog(job_id=job.id, level="warning",
                              message=f"Failed input image: {exc}"))

        # Run provider as a task + watchdog that aborts on user cancel.
        provider_task = asyncio.create_task(provider.run(JobInput(
            prompt=job.prompt,
            job_type=job.job_type,
            options=job.input_payload,
            profile_path=profile.profile_path if profile else "",
            attachments=attachments,
        )))
        watcher = asyncio.create_task(_watch_for_cancel(job.id, provider_task))
        cancelled_mid_run = False
        try:
            result = await provider_task
        except asyncio.CancelledError:
            cancelled_mid_run = True
            result = None  # short-circuit to cancelled-handling below
        finally:
            watcher.cancel()
            try:
                await watcher
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

        if cancelled_mid_run:
            job.status = "cancelled"
            job.completed_at = datetime.now(timezone.utc)
            job.error_message = "[cancelled] Cancelled by user during provider run"
            db.add(JobLog(job_id=job.id, level="info",
                          message="Provider task cancelled mid-run"))
            # skip the success/retry paths
            result = None

        if result is None:
            # cancelled_mid_run path — already wrote terminal status above.
            pass
        elif result.success and result.files:
            job.status = "uploading_result"
            saved_ids: list[uuid.UUID] = []
            total_bytes = 0
            for rf in result.files:
                actual_type = (
                    "video" if rf.mime.startswith("video/")
                    else "image" if rf.mime.startswith("image/")
                    else job.job_type
                )
                file_rec = await files_service.save_job_result(
                    db, user_id=job.user_id, job_id=job.id,
                    file_name=rf.name, file_type=actual_type,
                    mime_type=rf.mime, data=rf.bytes,
                )
                saved_ids.append(file_rec.id)
                total_bytes += len(rf.bytes)
            job.result_file_id = saved_ids[0]
            job.result_url = f"/api/files/{saved_ids[0]}/download"
            job.status = "success"
            job.completed_at = datetime.now(timezone.utc)
            db.add(JobLog(job_id=job.id, level="info",
                          message=f"Job success: {len(saved_ids)} file(s), {total_bytes} bytes"))
        else:
            error_code = result.error_code or "unknown_error"
            job.error_message = f"[{error_code}] {result.error_message or 'unknown'}"
            db.add(JobLog(job_id=job.id, level="error",
                          message=f"Provider error: {job.error_message}",
                          context={"error_code": error_code, "extra": result.extra}))
            profile_terminal_status = _profile_status_after_error(error_code)

            should_retry = (
                result.retryable
                and error_code not in TERMINAL_ERROR_CODES
                and job.retry_count < job.max_retry
            )
            if should_retry:
                job.retry_count += 1
                table = (RATE_LIMIT_BACKOFF_SECONDS if error_code == "rate_limited"
                         else BACKOFF_SECONDS)
                delay = table[min(job.retry_count - 1, len(table) - 1)]
                job.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
                job.status = "queued"
                db.add(JobLog(job_id=job.id, level="info",
                              message=f"Retry after ~{delay}s ({job.retry_count}/{job.max_retry}, code={error_code})"))
            else:
                job.status = "failed"
                job.completed_at = datetime.now(timezone.utc)

    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_message = f"Worker exception: {type(exc).__name__}: {exc}"
        job.completed_at = datetime.now(timezone.utc)
        db.add(JobLog(job_id=job.id, level="error", message=job.error_message))

    finally:
        if slot_held:
            await _release_slot(db, slot_held, new_status=profile_terminal_status)

    if job.status in {"success", "failed", "cancelled"}:
        await _maybe_send_webhook(db, job)

    await db.commit()


async def _startup_recovery() -> None:
    """Repair state left behind by a crashed worker:

    1. Jobs stuck in running/processing/uploading → requeue (the previous
       worker is gone; nothing is driving them).
    2. Recompute every profile's `active_jobs` from real running-job count;
       if it drops to 0, restore status from `running_job` to `logged_in`.
    3. Reap orphan VNC containers whose profile was deleted while we were down.
    """
    async with SessionLocal() as db:
        stuck = (await db.execute(
            select(Job).where(Job.status.in_(RUNNING_JOB_STATES))
        )).scalars().all()
        requeued = failed = 0
        now = datetime.now(timezone.utc)
        for j in stuck:
            # If the job already exhausted its retries, send it to terminal
            # rather than letting the loop pick it up forever. The previous
            # worker run was the LAST allowed attempt — count it as failed.
            if j.retry_count >= j.max_retry:
                j.status = "failed"
                j.completed_at = now
                if not j.error_message:
                    j.error_message = "[worker_crashed] Worker died mid-job; retries exhausted"
                db.add(JobLog(job_id=j.id, level="error",
                              message=f"Worker {WORKER_ID} marked stuck job failed (retries exhausted)"))
                failed += 1
            else:
                j.status = "queued"
                j.started_at = None
                # Don't reset next_attempt_at if it was already set in the future.
                db.add(JobLog(job_id=j.id, level="warning",
                              message=f"Worker {WORKER_ID} recovered orphan job (was {j.status})"))
                requeued += 1

        profiles = (await db.execute(select(Profile))).scalars().all()
        all_pids = {str(p.id) for p in profiles}
        for p in profiles:
            live = (await db.execute(
                select(func.count()).select_from(Job)
                .where(Job.profile_id == p.id, Job.status.in_(RUNNING_JOB_STATES))
            )).scalar_one()
            if p.active_jobs != live:
                p.active_jobs = int(live or 0)
            if p.active_jobs == 0 and p.status == "running_job":
                p.status = "logged_in"
        await db.commit()
        if stuck:
            print(f"[worker] startup-recovery: requeued={requeued} failed={failed}", flush=True)

        # Reap zombies: queued jobs whose retry_count is STRICTLY beyond the
        # cap. retry_count == max_retry is legitimate (final allowed attempt
        # is pending). retry_count > max_retry can only happen from old buggy
        # state where requeues skipped the cap check.
        zombies = (await db.execute(
            select(Job).where(
                Job.status == "queued",
                Job.retry_count > Job.max_retry,
            )
        )).scalars().all()
        for z in zombies:
            z.status = "failed"
            z.completed_at = datetime.now(timezone.utc)
            if not z.error_message:
                z.error_message = "[retries_exhausted] Job exceeded max_retry"
            db.add(JobLog(job_id=z.id, level="error",
                          message=f"Worker {WORKER_ID} reaped zombie queued job (retry={z.retry_count}/{z.max_retry})"))
        if zombies:
            await db.commit()
            print(f"[worker] startup-recovery: reaped {len(zombies)} zombie queued job(s)", flush=True)

    try:
        from app.browser import vnc_manager
        reaped = vnc_manager.reap_orphans(all_pids)
        if reaped:
            print(f"[worker] reaped orphan VNC: {reaped}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[worker] orphan reap failed: {exc}", flush=True)


async def loop(job_type_filter: str | None = None) -> None:
    print(f"[worker] {WORKER_ID} starting (job_type={job_type_filter or 'any'})", flush=True)
    try:
        await _startup_recovery()
    except Exception as exc:  # noqa: BLE001
        print(f"[worker] startup-recovery failed: {exc}", flush=True)
    # Concurrent processing: when we claim a job, run process_one as a background
    # task so the loop can pick up another job immediately. Total parallelism is
    # bounded by sum of max_concurrent_jobs across all profiles.
    in_flight: set[asyncio.Task] = set()
    MAX_IN_FLIGHT = int(os.environ.get("WORKER_MAX_IN_FLIGHT", "16"))

    while True:
        try:
            # Reap finished tasks
            in_flight = {t for t in in_flight if not t.done()}
            if len(in_flight) >= MAX_IN_FLIGHT:
                await asyncio.sleep(1)
                continue

            claimed_id: uuid.UUID | None = None
            async with SessionLocal() as db:
                async with db.begin():
                    job = await _pick_job(db, job_type_filter)
                    if job:
                        job.status = "running"
                        claimed_id = job.id
            if not claimed_id:
                await asyncio.sleep(2)
                continue

            async def _run(jid: uuid.UUID):
                async with SessionLocal() as db2:
                    j = await db2.get(Job, jid)
                    if j:
                        await process_one(db2, j)

            task = asyncio.create_task(_run(claimed_id))
            in_flight.add(task)
        except Exception as exc:  # noqa: BLE001
            print(f"[worker] loop error: {type(exc).__name__}: {exc}", flush=True)
            await asyncio.sleep(5)


if __name__ == "__main__":
    job_type = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(loop(job_type))
