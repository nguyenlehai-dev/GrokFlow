import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class SubscriptionOut(BaseModel):
    id: uuid.UUID
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


class PaymentOut(BaseModel):
    id: uuid.UUID
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

    class Config:
        from_attributes = True


class InvoiceOut(BaseModel):
    id: uuid.UUID
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

    class Config:
        from_attributes = True


class BillingSummaryOut(BaseModel):
    """Composite payload for the /billing/me page."""
    current_subscription: SubscriptionOut | None
    pending_subscriptions: list[SubscriptionOut]
    recent_payments: list[PaymentOut]
    recent_invoices: list[InvoiceOut]


class CheckoutRequest(BaseModel):
    plan_code: str
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    provider: Literal["momo", "vnpay", "zalopay", "stripe", "manual"] = "manual"
    billing_info: dict | None = None  # {name, email, company, tax_code, address}


class CheckoutResponse(BaseModel):
    """Returned from POST /api/billing/checkout.

    payment_url is None when provider=manual — user is told to wait for admin
    confirmation. For real providers it'll be the redirect URL to the payment page.
    """
    subscription_id: uuid.UUID
    payment_id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_number: str
    amount: Decimal
    currency: str
    status: str
    payment_url: str | None
    instructions: str
