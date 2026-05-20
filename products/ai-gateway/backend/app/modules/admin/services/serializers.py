"""Admin response builders — DB row → Pydantic Out model.

Each pair: a list builder (bulk-loads users/plans once) and a single-row
builder (used on the mutation path after a refresh).
"""

from __future__ import annotations

from app.models import Invoice, Payment, Plan, Subscription, User
from app.modules.admin.schemas import (
    AdminInvoiceOut,
    AdminPaymentOut,
    AdminSubscriptionOut,
)
from .tenancy import bulk_fetch_map


async def subs_to_out(db, subs: list[Subscription]) -> list[AdminSubscriptionOut]:
    user_ids = {s.user_id for s in subs if s.user_id}
    plan_ids = {s.plan_id for s in subs if s.plan_id}
    users = await bulk_fetch_map(db, User, user_ids)
    plans = await bulk_fetch_map(db, Plan, plan_ids)
    out: list[AdminSubscriptionOut] = []
    for sub in subs:
        u = users.get(sub.user_id)
        p = plans.get(sub.plan_id)
        out.append(AdminSubscriptionOut(
            id=sub.id,
            user_id=sub.user_id,
            user_email=u.email if u else "",
            plan_id=sub.plan_id,
            plan_code=p.code if p else "",
            plan_name=p.name if p else "",
            status=sub.status,
            billing_cycle=sub.billing_cycle,
            provider=sub.provider,
            amount=sub.amount,
            currency=sub.currency,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            cancelled_at=sub.cancelled_at,
            created_at=sub.created_at,
        ))
    return out


async def sub_with_joins(db, sub: Subscription) -> AdminSubscriptionOut:
    user = await db.get(User, sub.user_id)
    plan = await db.get(Plan, sub.plan_id)
    return AdminSubscriptionOut(
        id=sub.id,
        user_id=sub.user_id,
        user_email=user.email if user else "",
        plan_id=sub.plan_id,
        plan_code=plan.code if plan else "",
        plan_name=plan.name if plan else "",
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        provider=sub.provider,
        amount=sub.amount,
        currency=sub.currency,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        cancelled_at=sub.cancelled_at,
        created_at=sub.created_at,
    )


async def pays_to_out(db, pays: list[Payment]) -> list[AdminPaymentOut]:
    user_ids = {p.user_id for p in pays if p.user_id}
    users = await bulk_fetch_map(db, User, user_ids)
    return [
        AdminPaymentOut(
            id=p.id, user_id=p.user_id,
            user_email=users[p.user_id].email if p.user_id in users else "",
            subscription_id=p.subscription_id,
            amount=p.amount, currency=p.currency, status=p.status,
            provider=p.provider, provider_payment_id=p.provider_payment_id,
            payment_method=p.payment_method, paid_at=p.paid_at,
            failure_reason=p.failure_reason, created_at=p.created_at,
        )
        for p in pays
    ]


async def pay_with_email(db, pay: Payment) -> AdminPaymentOut:
    user = await db.get(User, pay.user_id)
    return AdminPaymentOut(
        id=pay.id,
        user_id=pay.user_id,
        user_email=user.email if user else "",
        subscription_id=pay.subscription_id,
        amount=pay.amount,
        currency=pay.currency,
        status=pay.status,
        provider=pay.provider,
        provider_payment_id=pay.provider_payment_id,
        payment_method=pay.payment_method,
        paid_at=pay.paid_at,
        failure_reason=pay.failure_reason,
        created_at=pay.created_at,
    )


async def invs_to_out(db, invs: list[Invoice]) -> list[AdminInvoiceOut]:
    user_ids = {i.user_id for i in invs if i.user_id}
    users = await bulk_fetch_map(db, User, user_ids)
    return [
        AdminInvoiceOut(
            id=i.id, user_id=i.user_id,
            user_email=users[i.user_id].email if i.user_id in users else "",
            subscription_id=i.subscription_id, payment_id=i.payment_id,
            invoice_number=i.invoice_number,
            amount=i.amount, tax=i.tax, total=i.total,
            currency=i.currency, status=i.status,
            issued_at=i.issued_at, paid_at=i.paid_at,
            line_items=i.line_items, billing_info=i.billing_info,
            pdf_url=i.pdf_url, created_at=i.created_at,
        )
        for i in invs
    ]


async def inv_with_email(db, inv: Invoice) -> AdminInvoiceOut:
    user = await db.get(User, inv.user_id)
    return AdminInvoiceOut(
        id=inv.id,
        user_id=inv.user_id,
        user_email=user.email if user else "",
        subscription_id=inv.subscription_id,
        payment_id=inv.payment_id,
        invoice_number=inv.invoice_number,
        amount=inv.amount,
        tax=inv.tax,
        total=inv.total,
        currency=inv.currency,
        status=inv.status,
        issued_at=inv.issued_at,
        paid_at=inv.paid_at,
        line_items=inv.line_items,
        billing_info=inv.billing_info,
        pdf_url=inv.pdf_url,
        created_at=inv.created_at,
    )
