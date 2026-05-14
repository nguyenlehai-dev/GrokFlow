"""Public 'Try image' endpoints — anonymous users can preview Grok by
generating up to N images per IP per day. Authenticated users go
through the normal /api/jobs path so plan quotas apply.

  POST /api/public/try-image            create a try-job (anon or auth)
  GET  /api/public/try-image/{job_id}   poll status (signed result_url)
  GET  /api/public/try-image/quota      remaining quota for the caller

Anon path:
  - IP-based Redis counter `anon:try:image:<ip>` with TTL 24h
  - Hard cap = settings.PUBLIC_TRY_IMAGE_DAILY (default 2)
  - Uses the super_admin's first logged_in grok profile as the runner.
    No profile available → 503 with a clear message.
  - result_url is rewritten with a short-lived share token so the
    response renders inline without auth.

Auth path:
  - Delegates to grok.jobs.service.create_job() — plan entitlements
    enforce daily/monthly limits with friendlier error messages.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import CurrentUserOptional, DbSession
from app.core.redis_client import get_redis
from app.models import Job, Profile, User
from app.modules.grok.files.router import make_share_token
from app.modules.grok.jobs import service as job_service

router = APIRouter(prefix="/api/public/try-image", tags=["public"])


# Daily cap per IP for anonymous tries. Override with env in prod if needed.
ANON_DAILY_CAP = 2
ANON_TTL_SECONDS = 24 * 3600
ANON_KEY_FMT = "anon:try:image:{ip}"


# ─── Schemas ───────────────────────────────────────────────────────────────

class TryImageIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    aspect: str = Field(default="1:1", pattern="^(1:1|16:9|9:16|4:3|3:4)$")
    quality: str = Field(default="speed", pattern="^(speed|quality)$")


class TryImageOut(BaseModel):
    job_id: uuid.UUID
    status: str
    result_url: str | None = None
    error_message: str | None = None
    remaining_today: int  # how many more anon tries the caller has left
    is_anon: bool


class QuotaOut(BaseModel):
    is_anon: bool
    daily_cap: int        # what the caller is capped at (anon: 2, auth: plan limit)
    used_today: int
    remaining: int


# ─── Helpers ───────────────────────────────────────────────────────────────

def _client_ip(req: Request) -> str:
    # Cloudflare puts the real IP in CF-Connecting-IP; trust it because
    # the only ingress is through the tunnel + nginx that we control.
    return (
        req.headers.get("cf-connecting-ip")
        or req.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (req.client.host if req.client else "0.0.0.0")
    )


async def _pick_anon_profile(db) -> Profile | None:
    """Find a super_admin's logged_in grok profile to run anon jobs on.

    Anon users don't have a domain, so they piggy-back on whoever runs
    GrokFlow. We prefer the least-recently-used profile so multiple
    parallel try-it visitors don't all stampede the same profile.
    """
    q = (
        select(Profile)
        .join(User, User.id == Profile.user_id)
        .where(
            User.role == "super_admin",
            Profile.provider == "grok",
            Profile.status.in_(["logged_in", "running_job"]),
        )
        .order_by(
            Profile.active_jobs.asc(),
            func.coalesce(Profile.last_used_at, Profile.created_at).asc(),
        )
        .limit(1)
    )
    return (await db.execute(q)).scalar_one_or_none()


async def _anon_remaining(redis, ip: str) -> int:
    raw = await redis.get(ANON_KEY_FMT.format(ip=ip))
    used = int(raw) if raw else 0
    return max(0, ANON_DAILY_CAP - used)


def _sign_result_url(raw_url: str | None) -> str | None:
    """Attach ?token= so <img> can render the inline result without auth.

    Same idea as the /gallery endpoint — we only sign /api/files/<id>/download.
    """
    if not raw_url:
        return None
    import re
    m = re.match(r"^/api/files/([0-9a-f-]{36})/download$", raw_url)
    if not m:
        return raw_url
    try:
        token = make_share_token(uuid.UUID(m.group(1)))
        return f"{raw_url}?token={token}"
    except Exception:  # noqa: BLE001
        return raw_url


# ─── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/quota", response_model=QuotaOut)
async def get_quota(
    req: Request, db: DbSession, user: CurrentUserOptional,
) -> QuotaOut:
    redis = get_redis()
    if user is None:
        ip = _client_ip(req)
        raw = await redis.get(ANON_KEY_FMT.format(ip=ip))
        used = int(raw) if raw else 0
        return QuotaOut(
            is_anon=True, daily_cap=ANON_DAILY_CAP,
            used_today=used, remaining=max(0, ANON_DAILY_CAP - used),
        )
    # Auth path: echo plan cap. Actual enforcement is in job_service.
    from app.modules.entitlements.service import get_effective_entitlements, get_limit
    eff = await get_effective_entitlements(db, user)
    cap = get_limit(eff, "daily_jobs")
    return QuotaOut(
        is_anon=False, daily_cap=cap, used_today=0,
        remaining=cap if cap > 0 else 999_999,
    )


@router.post("", response_model=TryImageOut, status_code=status.HTTP_201_CREATED)
async def create_try(
    payload: TryImageIn,
    req: Request,
    db: DbSession,
    user: CurrentUserOptional,
) -> TryImageOut:
    redis = get_redis()
    is_anon = user is None

    if is_anon:
        ip = _client_ip(req)
        key = ANON_KEY_FMT.format(ip=ip)
        used = int(await redis.get(key) or 0)
        if used >= ANON_DAILY_CAP:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "anon_quota_exhausted",
                    "message": (
                        f"Bạn đã dùng hết {ANON_DAILY_CAP} lần thử miễn phí "
                        "trong 24h. Đăng ký tài khoản để dùng tiếp."
                    ),
                },
            )
        profile = await _pick_anon_profile(db)
        if not profile:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "no_anon_profile",
                    "message": "Hệ thống tạm thiếu profile chạy thử. Quay lại sau.",
                },
            )
        # Run as the profile's owner (super_admin) so existing job flow
        # (worker, profile assignment, file storage) just works.
        job = await job_service.create_job(
            db,
            user_id=profile.user_id,
            provider="grok",
            job_type="image",
            prompt=payload.prompt,
            profile_id=profile.id,
            options={
                "aspect": payload.aspect,
                "quality": payload.quality,
                "size": _aspect_to_size(payload.aspect),
                "n": 1,
                # Marker so we can spot anon load in metrics later.
                "_anon_origin": ip,
            },
        )
        # Increment counter only AFTER successful job creation so a failed
        # spawn doesn't burn the user's free attempt.
        new_used = await redis.incr(key)
        if new_used == 1:
            await redis.expire(key, ANON_TTL_SECONDS)
        remaining = max(0, ANON_DAILY_CAP - new_used)
        return TryImageOut(
            job_id=job.id, status=job.status,
            result_url=_sign_result_url(job.result_url),
            error_message=job.error_message,
            remaining_today=remaining, is_anon=True,
        )

    # Auth path — let the normal job pipeline apply plan entitlements.
    job = await job_service.create_job(
        db,
        user_id=user.id,
        provider="grok",
        job_type="image",
        prompt=payload.prompt,
        profile_id=None,  # auto-pick by plan visibility
        options={
            "aspect": payload.aspect,
            "quality": payload.quality,
            "size": _aspect_to_size(payload.aspect),
            "n": 1,
        },
    )
    return TryImageOut(
        job_id=job.id, status=job.status,
        result_url=_sign_result_url(job.result_url),
        error_message=job.error_message,
        remaining_today=999_999, is_anon=False,
    )


@router.get("/{job_id}", response_model=TryImageOut)
async def poll_try(
    job_id: uuid.UUID,
    req: Request,
    db: DbSession,
    user: CurrentUserOptional,
) -> TryImageOut:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    # Anyone with the job_id can poll the status of a try-image job.
    # This is intentional — anon users hold only the UUID after submit
    # and need to read result_url. UUIDs are unguessable enough as a
    # capability token for this preview use-case.
    is_anon = user is None
    remaining = (
        await _anon_remaining(get_redis(), _client_ip(req)) if is_anon else 999_999
    )
    return TryImageOut(
        job_id=job.id, status=job.status,
        result_url=_sign_result_url(job.result_url),
        error_message=job.error_message,
        remaining_today=remaining, is_anon=is_anon,
    )


def _aspect_to_size(aspect: str) -> str:
    return {
        "1:1": "1024x1024",
        "16:9": "1024x576",
        "9:16": "576x1024",
        "4:3": "1024x768",
        "3:4": "768x1024",
    }.get(aspect, "1024x1024")
