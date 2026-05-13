import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.models import Job, JobLog, Profile, ProfileDomainAssignment, User


async def _resolve_profile_for_job(
    db: AsyncSession,
    *,
    requested_id: uuid.UUID | None,
    user_id: uuid.UUID,
    provider: str,
    requester_domain_id: uuid.UUID | None = None,
) -> Profile | None:
    """Customer cannot use their own profile — always pick from admin pool.

    If `requested_id` provided: validate it belongs to admin and is logged_in / running_job.
    Else: auto-pick the least-recently-used logged_in admin profile for this provider.
    """
    # "Admin pool" includes both per-domain `admin` and platform `super_admin`
    # — the role hierarchy treats super_admin as a superset of admin, so any
    # profile super_admin owns should also be available as a shared pool entry.
    # Without this, a super_admin doing the initial Auto-login (the most
    # common bootstrapping path) ends up with logged_in profiles that NOBODY
    # — not even themselves — can use as a job runner.
    ADMIN_ROLES = ("admin", "super_admin")

    # A profile is visible to a tenant in `requester_domain_id` if EITHER
    #   (a) the profile's owner is in that domain (legacy direct ownership), OR
    #   (b) an explicit (profile, domain) row exists in profile_domain_assignments
    # When requester_domain_id is None (super_admin path) the visibility filter
    # is skipped entirely.
    assigned_to_domain = (
        select(ProfileDomainAssignment.profile_id)
        .where(ProfileDomainAssignment.domain_id == requester_domain_id)
        .scalar_subquery()
        if requester_domain_id is not None
        else None
    )

    if requested_id:
        profile = await db.get(Profile, requested_id)
        if not profile:
            raise NotFound("profile")
        owner = await db.get(User, profile.user_id)
        if not owner or owner.role not in ADMIN_ROLES:
            raise PermissionDenied("Profile is not in the admin pool")
        if profile.provider != provider:
            raise InvalidPayload(f"Profile provider mismatch: profile={profile.provider}, requested={provider}")
        if profile.status not in {"logged_in", "running_job"}:
            raise InvalidPayload(f"Profile not ready (status={profile.status}). Ask admin to refresh.")
        # Tenant visibility check — same rule as auto-pick.
        if requester_domain_id is not None and owner.domain_id != requester_domain_id:
            visible = (
                await db.execute(
                    select(ProfileDomainAssignment.profile_id)
                    .where(
                        ProfileDomainAssignment.profile_id == profile.id,
                        ProfileDomainAssignment.domain_id == requester_domain_id,
                    )
                )
            ).first()
            if not visible:
                raise PermissionDenied("Profile not assigned to your domain")
        return profile

    # Auto-pick: any logged_in / running_job admin-pool profile for this provider.
    # We deliberately do NOT filter by `active_jobs < max_concurrent_jobs` here
    # — that's a runtime-concurrency check, not a queue-admission gate. Jobs
    # for a fully-loaded profile should QUEUE behind in-flight ones, not be
    # rejected. The worker's _try_acquire_slot enforces concurrency at run
    # time. We just pick the least-loaded profile to spread the queue.
    where_clauses = [
        User.role.in_(ADMIN_ROLES),
        Profile.provider == provider,
        Profile.status.in_(["logged_in", "running_job"]),
    ]
    if assigned_to_domain is not None:
        where_clauses.append(
            (User.domain_id == requester_domain_id)
            | Profile.id.in_(assigned_to_domain)
        )
    stmt = (
        select(Profile)
        .join(User, User.id == Profile.user_id)
        .where(*where_clauses)
        .order_by(
            Profile.active_jobs.asc(),
            func.coalesce(Profile.last_used_at, Profile.created_at).asc(),
        )
        .limit(1)
    )
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if profile:
        # Bump last_used_at NOW so back-to-back create_job calls don't all
        # land on the same profile while waiting for the worker to pick up
        # the first one. Without this, 10 jobs queued in a burst all see
        # active_jobs=0 across the pool and the ORDER BY tie-breaker keeps
        # picking the first profile by id → starving the others. The worker
        # also updates last_used_at when it acquires a slot, which is fine —
        # both writes are monotonic so they don't fight.
        profile.last_used_at = datetime.now(timezone.utc)
        await db.flush()
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
    # Look up requester's domain — used to filter the pool down to profiles
    # super_admin has loaned to this tenant + legacy same-domain profiles.
    # super_admin themselves are unscoped (pass None) so they can use any
    # profile in their own bootstrap workflow.
    requester = await db.get(User, user_id)
    requester_domain_id = (
        requester.domain_id
        if requester and requester.role != "super_admin"
        else None
    )
    profile = await _resolve_profile_for_job(
        db, requested_id=profile_id, user_id=user_id, provider=provider,
        requester_domain_id=requester_domain_id,
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
