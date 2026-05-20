"""Dashboard aggregations.

Two endpoints:
- GET /api/dashboard/me           — current user's stats
- GET /api/dashboard/admin        — system-wide stats (admin only)

Both return the same shape so the frontend can render either with one
component. `period` query: all | today | week | month — filters the
time-bounded counts (jobs, revenue).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

import uuid

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models import (
    ApiKey, Domain, Job, Payment, Profile, User,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

Period = Literal["all", "today", "week", "month"]


class AppItem(BaseModel):
    name: str
    count: int


class AppGroup(BaseModel):
    # Codes match Lucide icons on the FE side. New 'flow' + 'gateway' rows
    # reflect the project's two non-Grok feature areas; without them the
    # dashboard was Grok-only despite Flow + Gateway being live in prod.
    code: Literal["image", "video", "mini_app"]
    label: str
    items: list[AppItem]
    total: int = 0   # convenience sum so FE doesn't re-iterate


class RevenuePoint(BaseModel):
    month: str           # "2026-11"
    amount: float        # in VND (already converted from Decimal)


class JobTimePoint(BaseModel):
    day: str             # "2026-05-12"
    count: int


class DashboardTotals(BaseModel):
    jobs_total: int
    jobs_today: int
    jobs_success: int
    jobs_failed: int
    jobs_queued: int
    jobs_running: int
    profiles: int
    profiles_logged_in: int
    profiles_need_login: int
    slots_total: int
    slots_used: int
    api_keys: int
    users: int = 0            # admin only
    revenue_total: float = 0  # VND, paid only


class DomainStats(BaseModel):
    """Per-tenant rollup for the admin dashboard. Each row answers
    'what did THIS domain create / consume in the chosen period?' —
    super_admin sees one row per registered domain, sorted by total job
    count desc by default. Per-domain admin sees only their own row.
    """
    domain_id: str | None
    hostname: str | None
    users: int
    jobs_total: int
    jobs_image: int
    jobs_video: int
    jobs_failed: int
    jobs_success: int
    profiles: int
    api_keys: int
    revenue: float
    last_activity: str | None       # ISO datetime of last job created_at


class DashboardOut(BaseModel):
    period: Period
    scope: Literal["me", "admin"]
    totals: DashboardTotals
    app_groups: list[AppGroup]
    revenue: list[RevenuePoint]   # last 12 months
    jobs_timeseries: list[JobTimePoint]  # last 30 days
    per_domain: list[DomainStats] = []   # admin view only — empty on /me


def _period_bounds(period: Period) -> datetime | None:
    """Return the lower bound for the chosen period. None = unbounded (all)."""
    now = datetime.now(timezone.utc)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return None


async def _build(
    db,
    period: Period,
    scope: Literal["me", "admin"],
    user_id,
    domain_filter: uuid.UUID | None = None,
) -> DashboardOut:
    """Build the dashboard payload.

    `domain_filter` is honoured only in the admin scope — it narrows the
    app_groups + totals to a specific tenant so super_admin can drill into
    one domain without leaving the page. /me ignores it (user-scoped already).
    """
    bound = _period_bounds(period)
    is_admin = scope == "admin"

    # Resolve which user_ids live inside the requested domain (if any) so
    # the Grok job filter — keyed on user_id, not domain_id — can be scoped
    # without a JOIN per query.
    domain_user_ids: list[uuid.UUID] | None = None
    if is_admin and domain_filter is not None:
        domain_user_ids = list(
            (
                await db.execute(
                    select(User.id).where(User.domain_id == domain_filter)
                )
            ).scalars().all()
        )
        # Empty domain → no jobs match. Use [None] sentinel so SQL still
        # produces a valid (empty) result rather than dropping the WHERE.
        if not domain_user_ids:
            domain_user_ids = [uuid.UUID("00000000-0000-0000-0000-000000000000")]

    # ------------------ Jobs filter ------------------
    job_filters = [] if is_admin else [Job.user_id == user_id]
    if bound is not None:
        job_filters.append(Job.created_at >= bound)
    if domain_user_ids is not None:
        job_filters.append(Job.user_id.in_(domain_user_ids))

    # ------------------ Totals ------------------
    base_q = select(func.count()).select_from(Job)
    if not is_admin:
        base_q = base_q.where(Job.user_id == user_id)

    jobs_total = (await db.execute(base_q.with_only_columns(func.count()))).scalar() or 0

    # 24h
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    today_q = base_q.where(Job.created_at >= day_ago)
    jobs_today = (await db.execute(today_q)).scalar() or 0

    success_q = base_q.where(Job.status == "success")
    jobs_success = (await db.execute(success_q)).scalar() or 0

    failed_q = base_q.where(Job.status == "failed")
    jobs_failed = (await db.execute(failed_q)).scalar() or 0

    queued_q = base_q.where(Job.status == "queued")
    jobs_queued = (await db.execute(queued_q)).scalar() or 0

    running_q = base_q.where(Job.status.in_(["running", "processing_provider", "uploading_result"]))
    jobs_running = (await db.execute(running_q)).scalar() or 0

    # Profiles
    profile_filter = [] if is_admin else [Profile.user_id == user_id]
    profiles = (await db.execute(
        select(Profile).where(*profile_filter)
    )).scalars().all()
    profiles_count = len(profiles)
    profiles_logged_in = sum(1 for p in profiles if p.status in ("logged_in", "running_job"))
    profiles_need_login = sum(1 for p in profiles if p.status == "need_login")
    slots_total = sum(p.max_concurrent_jobs or 1 for p in profiles)
    slots_used = sum(p.active_jobs or 0 for p in profiles)

    # API Keys
    key_q = select(func.count()).select_from(ApiKey)
    if not is_admin:
        key_q = key_q.where(ApiKey.user_id == user_id)
    api_keys = (await db.execute(key_q)).scalar() or 0

    users_count = 0
    if is_admin:
        users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0

    # ------------------ Revenue (paid payments, by month, last 12 months) ------------------
    # Aggregate in Python — small dataset (months × users) and avoids the
    # Postgres "must appear in GROUP BY" gotcha with SQLAlchemy + to_char.
    one_year_ago = (datetime.now(timezone.utc) - timedelta(days=365))
    pay_q = (
        select(Payment.paid_at, Payment.amount)
        .where(Payment.status == "success", Payment.paid_at >= one_year_ago)
    )
    if not is_admin:
        pay_q = pay_q.where(Payment.user_id == user_id)
    pay_rows = (await db.execute(pay_q)).all()
    rev_by_month: dict[str, float] = defaultdict(float)
    for paid_at, amount in pay_rows:
        if paid_at is None:
            continue
        rev_by_month[paid_at.strftime("%Y-%m")] += float(amount or 0)
    revenue = [
        RevenuePoint(month=m, amount=a)
        for m, a in sorted(rev_by_month.items())
    ]
    revenue_total = sum(p.amount for p in revenue)

    # ------------------ Jobs timeseries (last 30 days) ------------------
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    ts_q = select(Job.created_at).where(Job.created_at >= thirty_days_ago)
    if not is_admin:
        ts_q = ts_q.where(Job.user_id == user_id)
    ts_rows = (await db.execute(ts_q)).all()
    jobs_by_day: dict[str, int] = defaultdict(int)
    for (created_at,) in ts_rows:
        jobs_by_day[created_at.strftime("%Y-%m-%d")] += 1
    jobs_timeseries = [
        JobTimePoint(day=d, count=c)
        for d, c in sorted(jobs_by_day.items())
    ]

    # ------------------ App groups (jobs grouped by model/provider in current period) ------------------
    # Job.model isn't a column — it's nested in input_payload JSON. Pull the
    # rows we need and bucket in Python so we can read the model out of JSON.
    apps_q = select(Job.provider, Job.job_type, Job.input_payload).where(*job_filters)
    rows = (await db.execute(apps_q)).all()

    image_apps: dict[str, int] = defaultdict(int)
    video_apps: dict[str, int] = defaultdict(int)
    for provider, job_type, payload in rows:
        # Friendly label: model from input_payload if present, else "<provider> <type>"
        model = (payload or {}).get("model") if isinstance(payload, dict) else None
        label = model if model else f"{(provider or 'unknown').title()} {(job_type or '').title()}".strip()
        if job_type == "image":
            image_apps[label] += 1
        elif job_type == "video":
            video_apps[label] += 1

    # Mini Apps: counts grouped per API Key (each key ≈ a customer's integration)
    miniapp_q = (
        select(ApiKey.name, func.count(Job.id).label("count"))
        .select_from(ApiKey)
        .join(Job, Job.api_key_id == ApiKey.id, isouter=True)
        .where(*job_filters)
        .group_by(ApiKey.id, ApiKey.name)
    )
    if not is_admin:
        miniapp_q = miniapp_q.where(ApiKey.user_id == user_id)
    try:
        miniapp_rows = (await db.execute(miniapp_q)).all()
    except Exception:
        # Older Job models may not have api_key_id — fail soft
        miniapp_rows = []

    miniapps = [
        AppItem(name=name or "Unnamed", count=count)
        for name, count in miniapp_rows if count > 0
    ]
    miniapps.sort(key=lambda x: x.count, reverse=True)

    # flowgrok standalone: Flow + Gateway groups dropped (those products
    # live in their own standalone repos). Keep only image/video/mini_app.

    def _grp(code, label, items):
        sorted_items = sorted(items, key=lambda x: x.count, reverse=True)
        return AppGroup(
            code=code, label=label, items=sorted_items,
            total=sum(i.count for i in sorted_items),
        )

    app_groups = [
        _grp("image", "Ảnh (Grok)",
             [AppItem(name=k, count=v) for k, v in image_apps.items()]),
        _grp("video", "Video (Grok)",
             [AppItem(name=k, count=v) for k, v in video_apps.items()]),
        _grp("mini_app", "API Keys (integrations)", miniapps),
    ]

    # ------------------ Per-domain breakdown (admin scope only) ------------------
    per_domain: list[DomainStats] = []
    if is_admin:
        per_domain = await _build_per_domain(db, bound)

    return DashboardOut(
        period=period,
        scope=scope,
        per_domain=per_domain,
        totals=DashboardTotals(
            jobs_total=jobs_total,
            jobs_today=jobs_today,
            jobs_success=jobs_success,
            jobs_failed=jobs_failed,
            jobs_queued=jobs_queued,
            jobs_running=jobs_running,
            profiles=profiles_count,
            profiles_logged_in=profiles_logged_in,
            profiles_need_login=profiles_need_login,
            slots_total=slots_total,
            slots_used=slots_used,
            api_keys=api_keys,
            users=users_count,
            revenue_total=revenue_total,
        ),
        app_groups=app_groups,
        revenue=revenue,
        jobs_timeseries=jobs_timeseries,
    )


async def _build_per_domain(db, bound: datetime | None) -> list[DomainStats]:
    """Aggregate every tenant domain's activity for the dashboard table.

    One SQL roundtrip per axis instead of per-domain (5 queries total
    regardless of tenant count) — important because this endpoint is
    polled every 15s by the FE.

    Axes pulled:
      - jobs by status by domain
      - profiles by domain (via Profile.user → User.domain_id)
      - api_keys by domain
      - users by domain
      - revenue (sum paid Payment.amount) by domain
      - last_activity = max(Job.created_at) per domain
    """
    # Map domain_id → row template (start empty, fill axis-by-axis).
    domains = (await db.execute(select(Domain))).scalars().all()
    bucket: dict[str, DomainStats] = {}
    for d in domains:
        bucket[str(d.id)] = DomainStats(
            domain_id=str(d.id),
            hostname=d.hostname,
            users=0, jobs_total=0, jobs_image=0, jobs_video=0,
            jobs_failed=0, jobs_success=0, profiles=0, api_keys=0,
            revenue=0.0, last_activity=None,
        )
    # "(no domain)" bucket for orphan rows where User.domain_id is NULL.
    NO_DOMAIN = "__none__"
    bucket[NO_DOMAIN] = DomainStats(
        domain_id=None, hostname=None,
        users=0, jobs_total=0, jobs_image=0, jobs_video=0,
        jobs_failed=0, jobs_success=0, profiles=0, api_keys=0,
        revenue=0.0, last_activity=None,
    )

    def key_for(domain_id) -> str:
        return str(domain_id) if domain_id else NO_DOMAIN

    # Jobs aggregate
    job_filter = [Job.created_at >= bound] if bound is not None else []
    job_q = (
        select(
            User.domain_id,
            Job.job_type,
            Job.status,
            func.count(Job.id).label("n"),
            func.max(Job.created_at).label("last_at"),
        )
        .join(User, User.id == Job.user_id)
        .where(*job_filter)
        .group_by(User.domain_id, Job.job_type, Job.status)
    )
    for domain_id, job_type, status, n, last_at in (await db.execute(job_q)).all():
        slot = bucket.setdefault(key_for(domain_id), bucket[NO_DOMAIN])
        slot.jobs_total += n or 0
        if job_type == "image":
            slot.jobs_image += n or 0
        elif job_type == "video":
            slot.jobs_video += n or 0
        if status == "success":
            slot.jobs_success += n or 0
        elif status == "failed":
            slot.jobs_failed += n or 0
        if last_at and (not slot.last_activity or last_at.isoformat() > slot.last_activity):
            slot.last_activity = last_at.isoformat()

    # Users per domain
    user_q = (
        select(User.domain_id, func.count(User.id))
        .group_by(User.domain_id)
    )
    for domain_id, n in (await db.execute(user_q)).all():
        bucket[key_for(domain_id)].users = int(n or 0)

    # Profiles per domain
    prof_q = (
        select(User.domain_id, func.count(Profile.id))
        .join(User, User.id == Profile.user_id)
        .group_by(User.domain_id)
    )
    for domain_id, n in (await db.execute(prof_q)).all():
        bucket[key_for(domain_id)].profiles = int(n or 0)

    # API keys per domain
    key_q = (
        select(User.domain_id, func.count(ApiKey.id))
        .join(User, User.id == ApiKey.user_id)
        .group_by(User.domain_id)
    )
    for domain_id, n in (await db.execute(key_q)).all():
        bucket[key_for(domain_id)].api_keys = int(n or 0)

    # Revenue per domain (paid only, in chosen period if bound)
    pay_filter = [Payment.status == "success"]
    if bound is not None:
        pay_filter.append(Payment.paid_at >= bound)
    pay_q = (
        select(User.domain_id, func.sum(Payment.amount))
        .join(User, User.id == Payment.user_id)
        .where(*pay_filter)
        .group_by(User.domain_id)
    )
    for domain_id, total in (await db.execute(pay_q)).all():
        bucket[key_for(domain_id)].revenue = float(total or 0)

    # Drop the orphan bucket if it has nothing; otherwise keep it at the bottom.
    orphan = bucket.pop(NO_DOMAIN)
    rows = list(bucket.values())
    if orphan.users or orphan.jobs_total or orphan.profiles or orphan.api_keys:
        rows.append(orphan)

    # Sort by jobs_total desc — busiest tenant first.
    rows.sort(key=lambda r: (-r.jobs_total, -(r.revenue or 0)))
    return rows


@router.get("/me", response_model=DashboardOut)
async def dashboard_me(
    user: CurrentUser, db: DbSession,
    period: Period = Query(default="all"),
) -> DashboardOut:
    return await _build(db, period, "me", user.id)


@router.get("/admin", response_model=DashboardOut)
async def dashboard_admin(
    admin: AdminUser, db: DbSession,
    period: Period = Query(default="all"),
    domain_id: uuid.UUID | None = Query(
        default=None,
        description="Filter app_groups + totals to a specific tenant. "
                    "Per-domain admin is force-scoped to their own domain.",
    ),
) -> DashboardOut:
    # Per-domain admin: cannot peek into other tenants — force the filter.
    effective_domain = admin.domain_id if admin.role != "super_admin" else domain_id
    return await _build(db, period, "admin", admin.id, domain_filter=effective_domain)


@router.get("/admin/pending-billing")
async def pending_billing_widget(admin: AdminUser, db: DbSession) -> dict:
    """List of subscriptions awaiting admin confirmation.

    Powers the "Pending upgrade requests" widget on the admin dashboard.
    Scope mirrors the dashboard:
      super_admin → every tenant
      admin       → their own domain only (via the user.domain_id join)
    """
    from app.models import Plan, Subscription, User

    q = (
        select(Subscription, User, Plan)
        .join(User, User.id == Subscription.user_id)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "pending")
        .order_by(Subscription.created_at.desc())
        .limit(25)
    )
    if admin.role != "super_admin":
        q = q.where(User.domain_id == admin.domain_id)

    rows = (await db.execute(q)).all()
    return {
        "count": len(rows),
        "items": [
            {
                "subscription_id": str(s.id),
                "user_email": u.email,
                "user_id": str(u.id),
                "plan_code": p.code,
                "plan_name": p.name,
                "amount": float(s.amount),
                "currency": s.currency,
                "billing_cycle": s.billing_cycle,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s, u, p in rows
        ],
    }
