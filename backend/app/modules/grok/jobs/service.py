import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.models import Job, JobLog, GrokProject, Profile, ProjectDomainAssignment, User
from app.modules.admin.audit import service as audit


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
    #   (b) the profile has at least one GrokProject assigned to that domain
    #       via project_domain_assignments.
    # When requester_domain_id is None (super_admin path) the visibility
    # filter is skipped entirely.
    assigned_to_domain = (
        select(GrokProject.profile_id)
        .join(ProjectDomainAssignment, ProjectDomainAssignment.project_id == GrokProject.id)
        .where(ProjectDomainAssignment.domain_id == requester_domain_id)
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
        # Tenant visibility check — same rule as auto-pick, via project assignments.
        if requester_domain_id is not None and owner.domain_id != requester_domain_id:
            visible = (
                await db.execute(
                    select(GrokProject.id)
                    .join(ProjectDomainAssignment, ProjectDomainAssignment.project_id == GrokProject.id)
                    .where(
                        GrokProject.profile_id == profile.id,
                        ProjectDomainAssignment.domain_id == requester_domain_id,
                    )
                    .limit(1)
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

    # Pick the specific GrokProject the worker should use. Rules:
    #   - tenant: project assigned to their domain on this profile
    #   - super_admin: first project of the profile (no scope filter)
    # If the profile has no projects yet we leave project_id NULL — worker
    # falls back to the legacy grok.com/imagine root URL. This keeps
    # bootstrapping smooth: super_admin can run a job before defining
    # projects.
    project_q = select(GrokProject).where(GrokProject.profile_id == profile.id)
    if requester_domain_id is not None:
        project_q = (
            project_q
            .join(ProjectDomainAssignment, ProjectDomainAssignment.project_id == GrokProject.id)
            .where(ProjectDomainAssignment.domain_id == requester_domain_id)
        )
    project_q = project_q.order_by(GrokProject.created_at.asc()).limit(1)
    picked_project = (await db.execute(project_q)).scalar_one_or_none()

    job = Job(
        user_id=user_id,
        api_key_id=api_key_id,
        profile_id=profile.id,
        project_id=picked_project.id if picked_project else None,
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
    # Audit so the /audit-logs page per-domain tab surfaces Grok activity.
    # Truncate the prompt to keep secrets / huge inputs out of audit_metadata.
    await audit.log_action(
        db, user_id=user_id, action="grok_job_created",
        target_type="job", target_id=job.id,
        metadata={
            "provider": provider,
            "job_type": job_type,
            "profile": profile.name,
            "profile_id": str(profile.id),
            "prompt_preview": (prompt or "")[:120],
        },
    )
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
