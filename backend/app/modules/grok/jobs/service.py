import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.models import Job, JobLog, Profile, User


async def _resolve_profile_for_job(
    db: AsyncSession, *, requested_id: uuid.UUID | None, user_id: uuid.UUID, provider: str,
) -> Profile | None:
    """Customer cannot use their own profile — always pick from admin pool.

    If `requested_id` provided: validate it belongs to admin and is logged_in / running_job.
    Else: auto-pick the least-recently-used logged_in admin profile for this provider.
    """
    if requested_id:
        profile = await db.get(Profile, requested_id)
        if not profile:
            raise NotFound("profile")
        owner = await db.get(User, profile.user_id)
        if not owner or owner.role != "admin":
            raise PermissionDenied("Profile is not in the admin pool")
        if profile.provider != provider:
            raise InvalidPayload(f"Profile provider mismatch: profile={profile.provider}, requested={provider}")
        if profile.status not in {"logged_in", "running_job"}:
            raise InvalidPayload(f"Profile not ready (status={profile.status}). Ask admin to refresh.")
        return profile

    # Auto-pick: any logged_in / running_job admin profile for this provider.
    # We deliberately do NOT filter by `active_jobs < max_concurrent_jobs` here
    # — that's a runtime-concurrency check, not a queue-admission gate. Jobs
    # for a fully-loaded profile should QUEUE behind in-flight ones, not be
    # rejected. The worker's _try_acquire_slot enforces concurrency at run
    # time. We just pick the least-loaded profile to spread the queue.
    stmt = (
        select(Profile)
        .join(User, User.id == Profile.user_id)
        .where(
            User.role == "admin",
            Profile.provider == provider,
            Profile.status.in_(["logged_in", "running_job"]),
        )
        .order_by(
            Profile.active_jobs.asc(),
            func.coalesce(Profile.last_used_at, Profile.created_at).asc(),
        )
        .limit(1)
    )
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if profile:
        return profile
    raise InvalidPayload(
        f"Không có profile {provider} nào logged_in. Admin cần Auto-login profile trước."
    )


async def create_job(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    provider: str,
    job_type: str,
    prompt: str,
    profile_id: uuid.UUID | None,
    options: dict[str, Any] | None,
    api_key_id: uuid.UUID | None = None,
) -> Job:
    profile = await _resolve_profile_for_job(
        db, requested_id=profile_id, user_id=user_id, provider=provider,
    )

    job = Job(
        user_id=user_id,
        api_key_id=api_key_id,
        profile_id=profile.id,
        provider=provider,
        job_type=job_type,
        prompt=prompt,
        input_payload=options or {},
        status="queued",
    )
    db.add(job)
    await db.flush()
    db.add(JobLog(job_id=job.id, level="info",
                  message=f"Job queued (profile={profile.name})"))
    await db.commit()
    await db.refresh(job)
    return job


async def assert_job_owner(db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID, is_admin: bool) -> Job:
    job = await db.get(Job, job_id)
    if not job:
        raise NotFound("job")
    if job.user_id != user_id and not is_admin:
        raise PermissionDenied()
    return job
