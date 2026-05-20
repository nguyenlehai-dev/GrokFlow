import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field

from app.core.types import PermissiveEmail


class AdminUserCreate(BaseModel):
    email: PermissiveEmail
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    role: str = Field(default="user", pattern="^(super_admin|admin|user|support)$")
    plan_id: uuid.UUID | None = None
    # Optional. super_admin can pick any domain; domain admin's domain_id is
    # forced server-side regardless of what they send.
    domain_id: uuid.UUID | None = None
    # Optional per-domain role. Must belong to the same domain as the user.
    role_id: uuid.UUID | None = None


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = Field(default=None, pattern="^(super_admin|admin|user|support)$")
    status: str | None = Field(default=None, pattern="^(active|inactive|banned|pending)$")
    password: str | None = Field(default=None, min_length=8, max_length=128)
    plan_id: uuid.UUID | None = None
    # Partial overrides merged on top of the plan's entitlements.
    # Send {} to clear all overrides; omit to leave unchanged.
    entitlement_overrides: dict | None = None
    # super_admin only — change which domain a user belongs to.
    # Zero-uuid (00000000-0000-0000-0000-000000000000) clears the field.
    domain_id: uuid.UUID | None = None
    # Per-domain role assignment. Zero-uuid clears the role (user falls
    # back to inheriting the domain's allowed_pages).
    role_id: uuid.UUID | None = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    # Plain str on output: don't re-validate stored emails. Older accounts
    # may have shapes that current input validation would reject (e.g. the
    # docstring example `admin@local` with no TLD), and serialization should
    # never reject existing data.
    email: str
    full_name: str | None
    role: str
    status: str
    created_at: datetime
    plan_id: uuid.UUID | None = None
    entitlement_overrides: dict | None = None
    domain_id: uuid.UUID | None = None
    role_id: uuid.UUID | None = None
    tool_install_id: uuid.UUID | None = None

    class Config:
        from_attributes = True


# ---------- Plans ----------


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern="^[a-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    is_default: bool = False
    sort_order: int = 0
    price_vnd: int | None = None
    price_usd_cents: int | None = None
    is_active: bool = True
    entitlements: dict = Field(
        default_factory=lambda: {"features": {}, "limits": {}},
        description="{features: {key: bool}, limits: {key: int}}",
    )


class PlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    sort_order: int | None = None
    price_vnd: int | None = None
    price_usd_cents: int | None = None
    is_active: bool | None = None
    entitlements: dict | None = None


class PlanOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_default: bool
    sort_order: int
    price_vnd: int | None
    price_usd_cents: int | None
    is_active: bool
    entitlements: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EntitlementCatalogOut(BaseModel):
    """Frontend uses this to render the toggle/limit editor."""
    features: dict[str, str]
    limits: dict[str, str]


class EffectiveEntitlementsOut(BaseModel):
    plan_code: str | None
    plan_name: str | None
    features: dict[str, bool]
    limits: dict[str, int]


class AdminStats(BaseModel):
    total_users: int
    total_api_keys: int
    total_profiles: int
    total_jobs: int
    jobs_24h_success: int
    jobs_24h_failed: int


# ---------- Billing (admin) ----------


class AdminSubscriptionCreate(BaseModel):
    user_id: uuid.UUID
    plan_id: uuid.UUID
    status: str = Field(default="active", pattern="^(pending|active|past_due|cancelled|expired)$")
    billing_cycle: str = Field(default="monthly", pattern="^(monthly|yearly)$")
    provider: str = Field(default="manual")
    amount: Decimal = Field(default=Decimal(0), ge=0)
    currency: str = Field(default="VND", max_length=8)
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None


class AdminSubscriptionUpdate(BaseModel):
    plan_id: uuid.UUID | None = None
    status: str | None = Field(default=None, pattern="^(pending|active|past_due|cancelled|expired)$")
    billing_cycle: str | None = Field(default=None, pattern="^(monthly|yearly)$")
    provider: str | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool | None = None


class AdminSubscriptionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    plan_id: uuid.UUID
    plan_code: str
    plan_name: str
    status: str
    billing_cycle: str
    provider: str
    amount: Decimal
    currency: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    cancelled_at: datetime | None
    created_at: datetime


class AdminPaymentCreate(BaseModel):
    user_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="VND", max_length=8)
    status: str = Field(default="success", pattern="^(pending|success|failed|refunded)$")
    provider: str = Field(default="manual")
    provider_payment_id: str | None = None
    payment_method: str | None = None
    paid_at: datetime | None = None
    failure_reason: str | None = None


class AdminPaymentUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, pattern="^(pending|success|failed|refunded)$")
    provider: str | None = None
    provider_payment_id: str | None = None
    payment_method: str | None = None
    paid_at: datetime | None = None
    failure_reason: str | None = None


class AdminPaymentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    subscription_id: uuid.UUID | None
    amount: Decimal
    currency: str
    status: str
    provider: str
    provider_payment_id: str | None
    payment_method: str | None
    paid_at: datetime | None
    failure_reason: str | None
    created_at: datetime


class AdminInvoiceCreate(BaseModel):
    user_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    payment_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    tax: Decimal = Field(default=Decimal(0), ge=0)
    currency: str = Field(default="VND", max_length=8)
    status: str = Field(default="issued", pattern="^(draft|issued|paid|void)$")
    line_items: list[dict] = Field(default_factory=list)
    billing_info: dict | None = None


class AdminInvoiceUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    tax: Decimal | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(draft|issued|paid|void)$")
    paid_at: datetime | None = None
    line_items: list[dict] | None = None
    billing_info: dict | None = None
    pdf_url: str | None = None


class AdminInvoiceOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    subscription_id: uuid.UUID | None
    payment_id: uuid.UUID | None
    invoice_number: str
    amount: Decimal
    tax: Decimal
    total: Decimal
    currency: str
    status: str
    issued_at: datetime | None
    paid_at: datetime | None
    line_items: list
    billing_info: dict | None
    pdf_url: str | None
    created_at: datetime
