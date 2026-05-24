"""Dashboard aggregations — ai-gateway variant.

The monorepo dashboard rolls up Grok jobs + Flow jobs + Profiles +
Gateway requests + revenue into a single panel. ai-gateway has no
Grok/Flow runtime, so this build returns GwRequest-only counters
and zero-fills the profile/slot fields kept for FE compat.

Two endpoints (same shape):
  GET /api/dashboard/me     — current user's stats
  GET /api/dashboard/admin  — system-wide stats (admin only)

`period` query: all | today | week | month.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models import ApiKey, Domain, GwRequest, GwVendor, Payment, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

Period = Literal["all", "today", "week", "month"]


class AppItem(BaseModel):
    name: str
    count: int


class AppGroup(BaseModel):
    code: Literal["image", "video", "flow", "gateway", "mini_app"]
    label: str
    items: list[AppItem]
    total: int = 0


class RevenuePoint(BaseModel):
    month: str
    amount: float


class JobTimePoint(BaseModel):
    day: str
    count: int


class DashboardTotals(BaseModel):
    jobs_total: int
    jobs_today: int
    jobs_success: int
    jobs_failed: int
    jobs_queued: int
    jobs_running: int
    profiles: int = 0
    profiles_logged_in: int = 0
    profiles_need_login: int = 0
    slots_total: int = 0
    slots_used: int = 0
    api_keys: int
    users: int = 0
    revenue_total: float = 0


class DomainStats(BaseModel):
    domain_id: str | None
    hostname: str | None
    users: int
    jobs_total: int
    jobs_image: int = 0
    jobs_video: int = 0
    jobs_failed: int
    jobs_success: int
    profiles: int = 0
    api_keys: int
    revenue: float
    last_activity: str | None


class DashboardOut(BaseModel):
    period: Period
    scope: Literal["me", "admin"]
    totals: DashboardTotals
    app_groups: list[AppGroup]
    revenue: list[RevenuePoint]
    jobs_timeseries: list[JobTimePoint]
    per_domain: list[DomainStats] = []


def _period_bounds(period: Period) -> datetime | None:
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
    is_admin: bool,
    domain_id,
) -> DashboardOut:
    bound = _period_bounds(period)

    domain_user_ids = (
        select(User.id).where(User.domain_id == domain_id)
        if is_admin and scope == "admin" and domain_id is not None
        else None
    )

    # GwRequest scopes by domain_id (not user_id — gateway calls are per
    # tenant, not per user). /me view returns the caller's domain's rows;
    # if the caller has no domain (super_admin unscoped) the filter is
    # an impossible predicate so /me returns empty.
    req_filters = []
    user_domain_id = domain_id  # closure
    if scope == "me":
        if user_domain_id is None:
            req_filters.append(GwRequest.id == None)  # noqa: E711 — force-empty
        else:
            req_filters.append(GwRequest.domain_id == user_domain_id)
    elif domain_id is not None:
        req_filters.append(GwRequest.domain_id == domain_id)
    if bound is not None:
        req_filters.append(GwRequest.created_at >= bound)

    base_q = select(func.count()).select_from(GwRequest)
    if req_filters:
        base_q = base_q.where(*req_filters)
    jobs_total = (await db.execute(base_q)).scalar_one() or 0

    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    today_q = base_q.where(GwRequest.created_at >= day_ago) if not req_filters else \
        select(func.count()).select_from(GwRequest).where(
            *req_filters, GwRequest.created_at >= day_ago
        )
    jobs_today = (await db.execute(today_q)).scalar_one() or 0

    succ_q = select(func.count()).select_from(GwRequest).where(
        *(req_filters + [GwRequest.status == "success"])
    )
    fail_q = select(func.count()).select_from(GwRequest).where(
        *(req_filters + [GwRequest.status == "error"])
    )
    jobs_success = (await db.execute(succ_q)).scalar_one() or 0
    jobs_failed = (await db.execute(fail_q)).scalar_one() or 0

    api_keys_q = select(func.count()).select_from(ApiKey)
    if scope == "me":
        api_keys_q = api_keys_q.where(ApiKey.user_id == user_id)
    elif domain_user_ids is not None:
        api_keys_q = api_keys_q.where(ApiKey.user_id.in_(domain_user_ids))
    api_keys = (await db.execute(api_keys_q)).scalar_one() or 0

    users_total = 0
    revenue_total = 0.0
    revenue: list[RevenuePoint] = []
    per_domain: list[DomainStats] = []

    if scope == "admin" and is_admin:
        users_q = select(func.count()).select_from(User)
        if domain_id is not None:
            users_q = users_q.where(User.domain_id == domain_id)
        users_total = (await db.execute(users_q)).scalar_one() or 0

        rev_q = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == "paid"
        )
        revenue_total = float((await db.execute(rev_q)).scalar_one() or 0)

        twelve_ago = datetime.now(timezone.utc) - timedelta(days=365)
        rev_series_q = (
            select(
                func.to_char(Payment.created_at, "YYYY-MM").label("month"),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(Payment.status == "paid", Payment.created_at >= twelve_ago)
            .group_by("month")
            .order_by("month")
        )
        try:
            rows = (await db.execute(rev_series_q)).all()
            revenue = [RevenuePoint(month=str(m), amount=float(a or 0)) for m, a in rows]
        except Exception:
            revenue = []

        if domain_id is None:
            per_domain = await _build_per_domain(db, bound)

    apps_q = (
        select(GwVendor.name, func.count(GwRequest.id))
        .join(GwRequest, GwRequest.vendor_id == GwVendor.id, isouter=True)
    )
    if req_filters:
        apps_q = apps_q.where(*req_filters)
    apps_q = apps_q.group_by(GwVendor.name).order_by(func.count(GwRequest.id).desc())
    apps_rows = (await db.execute(apps_q)).all()
    gateway_items = [
        AppItem(name=name or "unknown", count=int(c or 0)) for name, c in apps_rows
    ]
    app_groups = [
        AppGroup(
            code="gateway",
            label="Gateway",
            items=gateway_items,
            total=sum(it.count for it in gateway_items),
        ),
    ]

    thirty_ago = datetime.now(timezone.utc) - timedelta(days=30)
    ts_q = select(GwRequest.created_at).where(GwRequest.created_at >= thirty_ago)
    if req_filters:
        ts_q = ts_q.where(*req_filters)
    ts_rows = (await db.execute(ts_q)).all()
    daily: dict[str, int] = defaultdict(int)
    for (created_at,) in ts_rows:
        if created_at is None:
            continue
        daily[created_at.strftime("%Y-%m-%d")] += 1
    timeseries = [
        JobTimePoint(day=d, count=c) for d, c in sorted(daily.items())
    ]

    return DashboardOut(
        period=period,
        scope=scope,
        totals=DashboardTotals(
            jobs_total=jobs_total,
            jobs_today=jobs_today,
            jobs_success=jobs_success,
            jobs_failed=jobs_failed,
            jobs_queued=0,
            jobs_running=0,
            api_keys=api_keys,
            users=users_total,
            revenue_total=revenue_total,
        ),
        app_groups=app_groups,
        revenue=revenue,
        jobs_timeseries=timeseries,
        per_domain=per_domain,
    )


async def _build_per_domain(db, bound: datetime | None) -> list[DomainStats]:
    """Per-domain rollup. ai-gateway counts GwRequest instead of Grok jobs."""
    domains = (await db.execute(select(Domain))).scalars().all()
    out: list[DomainStats] = []
    for d in domains:
        user_ids_q = select(User.id).where(User.domain_id == d.id)
        users_count = (await db.execute(
            select(func.count()).select_from(User).where(User.domain_id == d.id)
        )).scalar_one() or 0
        # GwRequest carries domain_id directly (denormalised at request time).
        req_filter = [GwRequest.domain_id == d.id]
        if bound is not None:
            req_filter.append(GwRequest.created_at >= bound)
        jobs_total = (await db.execute(
            select(func.count()).select_from(GwRequest).where(*req_filter)
        )).scalar_one() or 0
        jobs_success = (await db.execute(
            select(func.count()).select_from(GwRequest).where(
                *req_filter, GwRequest.status == "success"
            )
        )).scalar_one() or 0
        jobs_failed = (await db.execute(
            select(func.count()).select_from(GwRequest).where(
                *req_filter, GwRequest.status == "error"
            )
        )).scalar_one() or 0
        api_keys = (await db.execute(
            select(func.count()).select_from(ApiKey).where(ApiKey.user_id.in_(user_ids_q))
        )).scalar_one() or 0
        last_q = select(func.max(GwRequest.created_at)).where(
            GwRequest.domain_id == d.id
        )
        last = (await db.execute(last_q)).scalar_one()
        out.append(DomainStats(
            domain_id=str(d.id),
            hostname=d.hostname,
            users=users_count,
            jobs_total=jobs_total,
            jobs_failed=jobs_failed,
            jobs_success=jobs_success,
            api_keys=api_keys,
            revenue=0.0,
            last_activity=last.isoformat() if last else None,
        ))
    out.sort(key=lambda r: r.jobs_total, reverse=True)
    return out


@router.get("/me", response_model=DashboardOut)
async def dashboard_me(
    me: CurrentUser, db: DbSession,
    period: Period = Query("all"),
) -> DashboardOut:
    return await _build(db, period, "me", me.id, False, me.domain_id)


@router.get("/admin", response_model=DashboardOut)
async def dashboard_admin(
    admin: AdminUser, db: DbSession,
    period: Period = Query("all"),
) -> DashboardOut:
    is_super = admin.role == "super_admin"
    return await _build(
        db, period, "admin", admin.id, True,
        None if is_super else admin.domain_id,
    )


@router.get("/admin/pending-billing")
async def pending_billing_widget(admin: AdminUser, db: DbSession) -> dict:
    """Pending invoice + payment counters for the admin sidebar badge."""
    from app.models import Invoice  # local import — keeps the top tight
    is_super = admin.role == "super_admin"

    inv_q = select(func.count()).select_from(Invoice).where(Invoice.status == "pending")
    pay_q = select(func.count()).select_from(Payment).where(Payment.status == "pending")
    if not is_super and admin.domain_id is not None:
        dom_users = select(User.id).where(User.domain_id == admin.domain_id)
        inv_q = inv_q.where(Invoice.user_id.in_(dom_users))
        pay_q = pay_q.where(Payment.user_id.in_(dom_users))
    return {
        "invoices_pending": (await db.execute(inv_q)).scalar_one() or 0,
        "payments_pending": (await db.execute(pay_q)).scalar_one() or 0,
    }
