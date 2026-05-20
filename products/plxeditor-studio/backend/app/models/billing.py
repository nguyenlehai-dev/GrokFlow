"""Billing-related models — Plan, Subscription, Payment, Invoice.

Plan is the catalog row; Subscription / Payment / Invoice form the
chronological record of a user's purchase lifecycle.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Plan entitlements: { "features": { "job.video": true, ... },
    #                      "limits":   { "max_profiles": 3, ... } }
    entitlements: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Pricing (NULL = "Liên hệ" / not directly purchasable). All amounts in
    # *smallest unit*: VND has no subunit so price_vnd is the integer VND amount.
    # USD is stored in cents (e.g. 19900 = $199.00).
    price_vnd: Mapped[int | None] = mapped_column(BigInteger)
    price_usd_cents: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class Subscription(Base, TimestampMixin):
    """A user's active subscription to a paid Plan.

    Lifecycle: pending → active → (cancelled | past_due | expired).
    `cancel_at_period_end` flags voluntary cancellation that takes effect when
    the current period ends — the user keeps access until then.
    """
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    billing_cycle: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship()  # noqa: F821 — resolved at session start
    plan: Mapped["Plan"] = relationship()


class Payment(Base, TimestampMixin):
    """A single payment attempt — success or failure.

    Always associated with a user; subscription_id is nullable to support
    one-time top-ups or admin-recorded offline payments.
    """
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), index=True)
    payment_method: Mapped[str | None] = mapped_column(String(50))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Full provider callback for debugging + audit
    raw_response: Mapped[dict | None] = mapped_column(JSONType)
    failure_reason: Mapped[str | None] = mapped_column(Text)


class Invoice(Base, TimestampMixin):
    """Accounting record. One invoice per payment cycle (or one-time charge).

    invoice_number is a unique human-friendly ID like INV-202611-0001.
    """
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="SET NULL")
    )
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # [{description, amount, quantity}]
    line_items: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    # {name, email, company, tax_code, address, country}
    billing_info: Mapped[dict | None] = mapped_column(JSONType)
    pdf_url: Mapped[str | None] = mapped_column(Text)
