"""Entitlements resolver and seeding.

Resolution order for an effective entitlement value:
    user.entitlement_overrides[k]  >  user.plan.entitlements[k]  >  default plan  >  False/0
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job, Plan, Subscription, User

from .catalog import ADMIN_ENTITLEMENTS, DEFAULT_PLANS, FEATURES, LIMITS


def _empty_effective() -> dict:
    return {
        "features": {k: False for k in FEATURES},
        "limits": {k: 0 for k in LIMITS},
    }


async def seed_default_plans(db: AsyncSession) -> None:
    """Insert built-in plans on first boot. Idempotent: skips codes that already exist."""
    existing_codes = set(
        (await db.execute(select(Plan.code))).scalars().all()
    )
    inserted = 0
    for spec in DEFAULT_PLANS:
        if spec["code"] in existing_codes:
            continue
        db.add(
            Plan(
                code=spec["code"],
                name=spec["name"],
                description=spec.get("description"),
                is_default=spec.get("is_default", False),
                sort_order=spec.get("sort_order", 0),
                entitlements=spec["entitlements"],
                price_vnd=spec.get("price_vnd"),
                price_usd_cents=spec.get("price_usd_cents"),
                is_active=spec.get("is_active", True),
            )
        )
        inserted += 1
    if inserted:
        await db.commit()


async def get_default_plan(db: AsyncSession) -> Plan | None:
    r = await db.execute(select(Plan).where(Plan.is_default.is_(True)).order_by(Plan.sort_order).limit(1))
    plan = r.scalar_one_or_none()
    if plan:
        return plan
    # Fall back to first plan by sort order if none flagged default.
    r = await db.execute(select(Plan).order_by(Plan.sort_order).limit(1))
    return r.scalar_one_or_none()


async def resolve_user_plan(db: AsyncSession, user: User) -> Plan | None:
    """Compat alias kept for callers that don't care about subscription
    state. Prefer `resolve_user_plan_with_status` for new code so the
    UI can react to past-due / expired states."""
    plan, _ = await resolve_user_plan_with_status(db, user)
    return plan


async def resolve_user_plan_with_status(
    db: AsyncSession, user: User,
) -> tuple[Plan | None, str]:
    """Return (Plan, subscription_status).

    Resolution order:
      1. user.plan_id with an `active` Subscription   → that plan, "active"
      2. user.plan_id with NO active Subscription     → default plan, "expired"|"past_due"|"none"
      3. no user.plan_id                              → default plan, "none"

    Without the subscription gate, a user whose payment lapses keeps
    full plan features until an admin manually clears `user.plan_id`.
    This couples access to billing state automatically so a renewal
    failure downgrades the user the next time `/api/auth/me` resolves.
    """
    target_plan: Plan | None = None
    sub_status: str = "none"

    if user.plan_id:
        # Latest subscription for this user (any status).
        latest_sub = (await db.execute(
            select(Subscription)
            .where(Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        if latest_sub:
            sub_status = latest_sub.status  # active | pending | past_due | expired | cancelled

        # Only honor the paid plan when the subscription is currently active
        # (and, for safety, points at the same plan). Otherwise we fall
        # through to the default plan — same effect as if admin had
        # cleared plan_id.
        if latest_sub and latest_sub.status == "active" and latest_sub.plan_id == user.plan_id:
            r = await db.execute(select(Plan).where(Plan.id == user.plan_id))
            target_plan = r.scalar_one_or_none()

    if target_plan is None:
        target_plan = await get_default_plan(db)
        # If user paid before but sub is no longer active, mark status
        # so the UI can show a "renew now" banner. When there's never
        # been a paid subscription we leave status="none".
        if user.plan_id and sub_status == "active":
            # User has plan_id pointing at a non-default plan but no
            # active subscription record (legacy data). Treat as expired.
            sub_status = "expired"

    return target_plan, sub_status


def _merge_entitlements(plan_ents: dict | None, overrides: dict | None) -> dict:
    out = _empty_effective()
    if plan_ents:
        for k, v in (plan_ents.get("features") or {}).items():
            out["features"][k] = bool(v)
        for k, v in (plan_ents.get("limits") or {}).items():
            try:
                out["limits"][k] = int(v)
            except (TypeError, ValueError):
                out["limits"][k] = 0
    if overrides:
        for k, v in (overrides.get("features") or {}).items():
            if k in out["features"]:
                out["features"][k] = bool(v)
        for k, v in (overrides.get("limits") or {}).items():
            if k in out["limits"]:
                try:
                    out["limits"][k] = int(v)
                except (TypeError, ValueError):
                    pass
    return out


async def get_effective_entitlements(db: AsyncSession, user: User) -> dict:
    """Resolve final feature/limit map for a user. Admin tiers always
    get full grant — both `admin` (per-domain) and `super_admin` (global).

    Without the super_admin branch a global super tied to a free-plan
    default would silently lose features (e.g. video gen) on a fresh
    install. Same blanket grant for both tiers matches the auth-deps
    contract (`require_admin` accepts both).
    """
    if user.role in ("admin", "super_admin"):
        return {
            "plan_code": "admin",
            "plan_name": "Admin (full access)",
            "subscription_status": "active",
            **ADMIN_ENTITLEMENTS,
        }
    plan, sub_status = await resolve_user_plan_with_status(db, user)
    eff = _merge_entitlements(
        plan.entitlements if plan else None,
        user.entitlement_overrides,
    )
    return {
        "plan_code": plan.code if plan else None,
        "plan_name": plan.name if plan else None,
        "subscription_status": sub_status,
        **eff,
    }


# ---------- Enforcement helpers ----------


class EntitlementDenied(Exception):
    """Raised when a user attempts an action their entitlements don't allow."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def require_feature(eff: dict, key: str, label: str | None = None) -> None:
    if not eff["features"].get(key, False):
        raise EntitlementDenied(
            "feature_not_allowed",
            f"Gói hiện tại không cho phép: {label or key}. Liên hệ admin để nâng cấp.",
        )


def get_limit(eff: dict, key: str) -> int:
    """Return numeric limit (0 = unlimited)."""
    return int(eff["limits"].get(key, 0) or 0)


async def count_jobs_in_window(db: AsyncSession, user_id, hours: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    r = await db.execute(
        select(func.count(Job.id)).where(Job.user_id == user_id, Job.created_at >= cutoff)
    )
    return int(r.scalar_one() or 0)


async def assert_concurrent_jobs(db: AsyncSession, user: User, eff: dict) -> None:
    """Block creation if user already has too many in-flight jobs."""
    cap = get_limit(eff, "max_concurrent_jobs")
    if cap <= 0:
        return
    in_flight_states = ("pending", "queued", "running", "processing_provider", "uploading_result")
    r = await db.execute(
        select(func.count(Job.id)).where(
            Job.user_id == user.id, Job.status.in_(in_flight_states)
        )
    )
    cur = int(r.scalar_one() or 0)
    if cur >= cap:
        raise EntitlementDenied(
            "max_concurrent_jobs_exceeded",
            f"Đã có {cur}/{cap} job đang chạy đồng thời. Đợi job xong rồi tạo tiếp, hoặc liên hệ admin nâng gói.",
        )


async def assert_quota(db: AsyncSession, user: User, eff: dict) -> None:
    """Block job creation if daily/monthly quotas are exhausted."""
    daily = get_limit(eff, "daily_jobs")
    if daily > 0:
        used_24h = await count_jobs_in_window(db, user.id, 24)
        if used_24h >= daily:
            raise EntitlementDenied(
                "daily_quota_exceeded",
                f"Đã đạt giới hạn {daily} job/24h của gói. Thử lại sau hoặc nâng gói.",
            )
    monthly = get_limit(eff, "monthly_jobs")
    if monthly > 0:
        used_30d = await count_jobs_in_window(db, user.id, 24 * 30)
        if used_30d >= monthly:
            raise EntitlementDenied(
                "monthly_quota_exceeded",
                f"Đã đạt giới hạn {monthly} job/30 ngày của gói. Liên hệ admin để nâng gói.",
            )


def assert_job_options(eff: dict, *, job_type: str, has_input_image: bool, options: dict | None) -> None:
    """Validate per-job entitlements: type, sub-mode, quality, resolution, duration, spicy."""
    options = options or {}
    if job_type == "image":
        require_feature(eff, "job.image", "Tạo job ảnh")
        if has_input_image:
            require_feature(eff, "job.image_to_image", "Image-to-image")
        if (options.get("quality") or "").lower() == "quality":
            require_feature(eff, "image.quality_high", "Chế độ Quality (image)")
    elif job_type == "video":
        require_feature(eff, "job.video", "Tạo job video")
        if has_input_image:
            require_feature(eff, "job.image_to_video", "Image-to-video")
        if (options.get("resolution") or "").lower() == "720p":
            require_feature(eff, "video.resolution_720p", "Resolution 720p")
        if str(options.get("duration") or "").lower() in {"10", "10s"}:
            require_feature(eff, "video.duration_10s", "Duration 10s")
        mode = (options.get("mode") or "").lower()
        if mode == "spicy":
            require_feature(eff, "video.spicy", "Spicy mode (18+)")
        elif mode == "fun":
            require_feature(eff, "video.fun_mode", "Fun mode")
        elif mode == "custom":
            require_feature(eff, "video.custom_mode", "Custom mode")
