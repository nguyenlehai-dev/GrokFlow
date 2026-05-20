"""Billing service — invoice numbering + subscription/payment helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Payment, Plan, Subscription, User


async def next_invoice_number(db: AsyncSession) -> str:
    """Generate a human-friendly invoice number like INV-202611-0001.

    Counter is per-month, padded to 4 digits. Concurrency-safe enough for
    our scale (single backend instance); upgrade to a sequence if we shard.
    """
    now = datetime.now(timezone.utc)
    prefix = f"INV-{now:%Y%m}-"
    last = (
        await db.execute(
            select(Invoice.invoice_number)
            .where(Invoice.invoice_number.like(f"{prefix}%"))
            .order_by(Invoice.invoice_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last:
        try:
            n = int(last.split("-")[-1]) + 1
        except ValueError:
            n = 1
    else:
        n = 1
    return f"{prefix}{n:04d}"


def period_end_for_cycle(start: datetime, cycle: str) -> datetime:
    """Compute subscription period_end from start + cycle.

    Uses calendar arithmetic — 1 month = same day next month. Falls back to
    30 days if the day doesn't exist in the next month (e.g. Jan 31 → Feb 28).
    """
    if cycle == "yearly":
        try:
            return start.replace(year=start.year + 1)
        except ValueError:
            return start + timedelta(days=365)
    # monthly
    year, month = start.year, start.month + 1
    if month > 12:
        year += 1
        month = 1
    try:
        return start.replace(year=year, month=month)
    except ValueError:
        return start + timedelta(days=30)


def price_for_cycle(plan: Plan, cycle: str) -> Decimal:
    """VND price for the chosen billing cycle. Yearly = monthly × 10 (2 months free).

    Returns 0 if plan has no price (Enterprise/Custom).
    """
    if plan.price_vnd is None:
        return Decimal(0)
    monthly = Decimal(plan.price_vnd)
    if cycle == "yearly":
        return monthly * Decimal(10)  # 2 months discount
    return monthly


async def get_active_subscription(db: AsyncSession, user_id) -> Subscription | None:
    """Return the user's currently-active subscription, if any.

    Only one active subscription per user is supported.
    """
    return (
        await db.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id, Subscription.status == "active")
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
