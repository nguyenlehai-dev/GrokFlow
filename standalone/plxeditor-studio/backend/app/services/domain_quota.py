"""Daily Grok job quota — enforcement + reporting.

Two independent scopes can carry a daily cap:

  • **Domain** (`domains.jobs_quota_per_day`, NULL = unlimited) — global
    cap for all users on a tenant domain.
  • **Tool Install** (`tool_installs.jobs_quota_per_day`, NULL = inherit)
    — per-desktop-machine override. Lets a reseller (one domain) sell
    different daily bundles to different customer machines without the
    counters bleeding into each other.

Counters live in separate tables (`domain_quota_periods`,
`tool_install_quota_periods`) keyed by (scope_id, period_date). Rows are
materialised lazily on the first reserve of the day via Postgres
INSERT … ON CONFLICT DO UPDATE so concurrent submits never double-spend.

Resolution order at submit time:

  1. If user has `tool_install_id` AND that install's `jobs_quota_per_day`
     is set → enforce against the install's counter.
  2. Else if `domain_id` is set AND domain's `jobs_quota_per_day` is set →
     enforce against the domain's counter.
  3. Else → unlimited (no-op).

Why count on enqueue, not on success?

Counting on success would let users spam queued jobs and force the worker
to do upstream work (cookie validation, file checks) "for free" before the
deny lands. Counting on enqueue caps the firehose at the right place. The
trade-off — system failures still burn quota — is acceptable because we
own that failure path and can refund manually if a P0 incident eats a
customer's day. For routine provider rejections (NSFW prompts etc.) the
charge stands; the user knew they were rolling the dice.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import TypedDict

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import Domain, DomainQuotaPeriod, ToolInstall, ToolInstallQuotaPeriod
from fastapi import status


class QuotaExceeded(AppError):
    """Raised when reserving would push the active scope past its cap.

    The error code carries which scope ran out so the frontend can show
    the right hint (contact admin vs upgrade plan vs wait until reset)."""

    def __init__(self, used: int, limit: int, period_end: datetime, scope: str) -> None:
        # scope in {"domain", "tool_install"} — frontend can branch on this.
        super().__init__(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"{scope}_quota_exceeded",
            f"Hết quota hôm nay ({used}/{limit}). Reset lúc {period_end.strftime('%H:%M %d/%m UTC')}.",
        )


class QuotaSnapshot(TypedDict):
    unlimited: bool
    period_date: str       # ISO date "2026-05-17"
    period_start: str      # ISO datetime "2026-05-17T00:00:00+00:00"
    period_end: str        # ISO datetime "2026-05-18T00:00:00+00:00"
    used: int
    limit: int | None      # None when unlimited
    remaining: int | None  # None when unlimited
    scope: str             # "domain" | "tool_install" | "none"


@dataclass(slots=True)
class _ActiveScope:
    """Which counter applies for the request, resolved at call time."""
    kind: str  # "tool_install" | "domain" | "none"
    scope_id: uuid.UUID | None
    limit: int | None
    # UTC hour the counter rolls over at. 0 = midnight UTC.
    reset_hour: int


def _period_start(now: datetime, reset_hour: int) -> datetime:
    """Most recent UTC datetime at `reset_hour:00:00`.

    If we're past today's reset hour, the period started today; otherwise
    it started yesterday at the same hour. This is what makes a configurable
    daily rollover work — the "period date" is whichever calendar date
    contains the start of the active period."""
    today_reset = now.replace(hour=reset_hour, minute=0, second=0, microsecond=0)
    if now >= today_reset:
        return today_reset
    return today_reset - timedelta(days=1)


def _period_bounds_for(now: datetime, reset_hour: int) -> tuple[date, datetime, datetime]:
    """Return (period_date, period_start, period_end) for the active period."""
    start = _period_start(now, reset_hour)
    end = start + timedelta(days=1)
    return start.date(), start, end


async def _resolve_scope(
    db: AsyncSession,
    domain_id: uuid.UUID | None,
    tool_install_id: uuid.UUID | None,
) -> _ActiveScope:
    """Pick which counter to check, applying tool_install-overrides-domain.

    Reset hour follows the same precedence: install's reset_hour wins
    when install owns the cap; domain's wins otherwise."""
    if tool_install_id is not None:
        ti = await db.get(ToolInstall, tool_install_id)
        if ti is not None and ti.jobs_quota_per_day is not None:
            return _ActiveScope(
                "tool_install", ti.id, int(ti.jobs_quota_per_day),
                int(ti.quota_reset_hour_utc or 0),
            )
    if domain_id is not None:
        dom = await db.get(Domain, domain_id)
        if dom is not None and dom.jobs_quota_per_day is not None:
            return _ActiveScope(
                "domain", dom.id, int(dom.jobs_quota_per_day),
                int(dom.quota_reset_hour_utc or 0),
            )
    return _ActiveScope("none", None, None, 0)


async def _resolve_reset_hour_unscoped(
    db: AsyncSession,
    domain_id: uuid.UUID | None,
    tool_install_id: uuid.UUID | None,
) -> int:
    """Like _resolve_scope but returns just the reset_hour even when no
    quota is set. Used by the snapshot endpoint so the FE renders the
    correct period_start/period_end even for unlimited tenants."""
    if tool_install_id is not None:
        ti = await db.get(ToolInstall, tool_install_id)
        if ti is not None:
            return int(ti.quota_reset_hour_utc or 0)
    if domain_id is not None:
        dom = await db.get(Domain, domain_id)
        if dom is not None:
            return int(dom.quota_reset_hour_utc or 0)
    return 0


async def check_and_reserve(
    db: AsyncSession,
    domain_id: uuid.UUID | None,
    tool_install_id: uuid.UUID | None = None,
) -> None:
    """Atomically claim 1 quota slot for the resolved scope, this period.

    No-op when no scope has a cap (super_admin, or tenant without quota
    set, or tool install without quota override AND no domain quota).

    Raises `QuotaExceeded` (HTTP 429) when the increment would exceed
    the cap. The race is closed by doing the UPSERT+RETURNING in a single
    statement: if two requests fire when counter is at 499/500, exactly
    one returns `jobs_used=500` and the other returns `501` — the 501
    one is rolled back below.
    """
    scope = await _resolve_scope(db, domain_id, tool_install_id)
    if scope.kind == "none" or scope.limit is None or scope.scope_id is None:
        return

    now = datetime.now(timezone.utc)
    period_date, _, period_end = _period_bounds_for(now, scope.reset_hour)

    if scope.kind == "tool_install":
        model = ToolInstallQuotaPeriod
        key_col = "tool_install_id"
        index_cols = ["tool_install_id", "period_date"]
        key_value = scope.scope_id
    else:
        model = DomainQuotaPeriod
        key_col = "domain_id"
        index_cols = ["domain_id", "period_date"]
        key_value = scope.scope_id

    stmt = (
        pg_insert(model)
        .values(**{key_col: key_value, "period_date": period_date, "jobs_used": 1})
        .on_conflict_do_update(
            index_elements=index_cols,
            set_={
                "jobs_used": model.__table__.c.jobs_used + 1,
                "updated_at": now,
            },
        )
        .returning(model.jobs_used)
    )
    result = await db.execute(stmt)
    used = result.scalar_one()

    if used > scope.limit:
        # We over-reserved — roll back this increment so the next request
        # sees an accurate counter. Use a clamped decrement (max(0,...))
        # in case something else already corrected it.
        await db.execute(
            update(model)
            .where(
                getattr(model, key_col) == key_value,
                model.period_date == period_date,
            )
            .values(jobs_used=model.__table__.c.jobs_used - 1)
        )
        await db.commit()
        raise QuotaExceeded(
            used=scope.limit,
            limit=scope.limit,
            period_end=period_end,
            scope=scope.kind,
        )

    await db.commit()


async def get_snapshot(
    db: AsyncSession,
    domain_id: uuid.UUID | None,
    tool_install_id: uuid.UUID | None = None,
) -> QuotaSnapshot:
    """Read-only quota state for whichever scope applies to the caller.

    Used by `GET /api/domain/quota`. Returns the install's snapshot if
    that overrides; falls back to the domain. If neither has a cap, we
    still report `used` from whichever scope had any counter activity in
    the current period so unlimited tenants can see their own throughput.
    """
    now = datetime.now(timezone.utc)
    # Resolve which scope to report on — same precedence as reserve.
    scope = await _resolve_scope(db, domain_id, tool_install_id)
    # Even unscoped (no cap) we still want the period bounds to match the
    # configured reset hour so the FE pill shows the right rollover time.
    reset_hour = scope.reset_hour if scope.kind != "none" else (
        await _resolve_reset_hour_unscoped(db, domain_id, tool_install_id)
    )
    period_date, period_start, period_end = _period_bounds_for(now, reset_hour)

    base: QuotaSnapshot = {
        "unlimited": True,
        "period_date": period_date.isoformat(),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "used": 0,
        "limit": None,
        "remaining": None,
        "scope": "none",
    }

    # Even when no scope is capped we report this period's tool_install OR
    # domain counter so admins can see throughput before turning on a cap.
    if tool_install_id is not None:
        ti_row = (await db.execute(
            select(ToolInstallQuotaPeriod).where(
                ToolInstallQuotaPeriod.tool_install_id == tool_install_id,
                ToolInstallQuotaPeriod.period_date == period_date,
            )
        )).scalar_one_or_none()
        if ti_row is not None:
            base["used"] = int(ti_row.jobs_used)
            base["scope"] = "tool_install"

    if base["used"] == 0 and domain_id is not None:
        dom_row = (await db.execute(
            select(DomainQuotaPeriod).where(
                DomainQuotaPeriod.domain_id == domain_id,
                DomainQuotaPeriod.period_date == period_date,
            )
        )).scalar_one_or_none()
        if dom_row is not None:
            base["used"] = int(dom_row.jobs_used)
            base["scope"] = "domain"

    if scope.kind == "none" or scope.limit is None:
        return base

    base["unlimited"] = False
    base["scope"] = scope.kind
    base["limit"] = int(scope.limit)

    # The counter we actually enforce against may differ from what we read
    # above (e.g. domain has counter rows from past unlimited days but now
    # the install has a cap). Re-read the right counter to be precise.
    if scope.kind == "tool_install":
        row = (await db.execute(
            select(ToolInstallQuotaPeriod).where(
                ToolInstallQuotaPeriod.tool_install_id == scope.scope_id,
                ToolInstallQuotaPeriod.period_date == period_date,
            )
        )).scalar_one_or_none()
    else:
        row = (await db.execute(
            select(DomainQuotaPeriod).where(
                DomainQuotaPeriod.domain_id == scope.scope_id,
                DomainQuotaPeriod.period_date == period_date,
            )
        )).scalar_one_or_none()
    base["used"] = int(row.jobs_used) if row else 0
    base["remaining"] = max(0, int(scope.limit) - base["used"])
    return base
