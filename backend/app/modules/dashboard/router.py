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

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models import ApiKey, Job, Payment, Profile, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

Period = Literal["all", "today", "week", "month"]


class AppItem(BaseModel):
    name: str
    count: int


class AppGroup(BaseModel):
    code: Literal["image", "video", "mini_app"]
    label: str
    items: list[AppItem]


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


class DashboardOut(BaseModel):
    period: Period
    scope: Literal["me", "admin"]
    totals: DashboardTotals
    app_groups: list[AppGroup]
    revenue: list[RevenuePoint]   # last 12 months
    jobs_timeseries: list[JobTimePoint]  # last 30 days


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


async def _build(db, period: Period, scope: Literal["me", "admin"], user_id) -> DashboardOut:
    bound = _period_bounds(period)
    is_admin = scope == "admin"

    # ------------------ Jobs filter ------------------
    job_filters = [] if is_admin else [Job.user_id == user_id]
    if bound is not None:
        job_filters.append(Job.created_at >= bound)

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

    app_groups = [
        AppGroup(
            code="image",
            label="Ảnh",
            items=sorted(
                [AppItem(name=k, count=v) for k, v in image_apps.items()],
                key=lambda x: x.count, reverse=True,
            ),
        ),
        AppGroup(
            code="video",
            label="Video",
            items=sorted(
                [AppItem(name=k, count=v) for k, v in video_apps.items()],
                key=lambda x: x.count, reverse=True,
            ),
        ),
        AppGroup(code="mini_app", label="Mini Apps", items=miniapps),
    ]

    return DashboardOut(
        period=period,
        scope=scope,
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
) -> DashboardOut:
    return await _build(db, period, "admin", admin.id)
