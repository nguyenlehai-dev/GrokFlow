"""/api/admin/payments — admin CRUD over Payment rows.

Manual record-keeping for cash / bank-transfer payments where the
provider webhook never fires.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import NotFound
from app.models import Payment, Subscription, User
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import (
    AdminPaymentCreate,
    AdminPaymentOut,
    AdminPaymentUpdate,
)
from app.modules.admin.services.serializers import (
    pay_with_email,
    pays_to_out,
)
from app.modules.admin.services.tenancy import (
    assert_billing_owner_in_admin_domain,
    scope_to_admin_domain,
)

router = APIRouter()


@router.get("/payments", response_model=list[AdminPaymentOut])
async def list_payments(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminPaymentOut]:
    q = scope_to_admin_domain(select(Payment), Payment.user_id, admin)
    if status_filter:
        q = q.where(Payment.status == status_filter)
    if user_id:
        q = q.where(Payment.user_id == user_id)
    q = q.order_by(Payment.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await pays_to_out(db, rows)


@router.post("/payments", response_model=AdminPaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment_admin(
    payload: AdminPaymentCreate, admin: AdminUser, db: DbSession,
) -> AdminPaymentOut:
    """Manually record a payment (e.g. cash, bank transfer received offline)."""
    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    if payload.subscription_id and not await db.get(Subscription, payload.subscription_id):
        raise NotFound("subscription")
    await assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    pay = Payment(
        user_id=payload.user_id, subscription_id=payload.subscription_id,
        amount=payload.amount, currency=payload.currency, status=payload.status,
        provider=payload.provider, provider_payment_id=payload.provider_payment_id,
        payment_method=payload.payment_method,
        paid_at=payload.paid_at or (datetime.now(timezone.utc) if payload.status == "success" else None),
        failure_reason=payload.failure_reason,
    )
    db.add(pay)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_payment",
        target_type="payment", target_id=pay.id,
        metadata={"user_id": str(payload.user_id), "amount": float(payload.amount)},
    )
    await db.commit()
    await db.refresh(pay)
    return await pay_with_email(db, pay)


@router.patch("/payments/{payment_id}", response_model=AdminPaymentOut)
async def update_payment_admin(
    payment_id: uuid.UUID, payload: AdminPaymentUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminPaymentOut:
    pay = await db.get(Payment, payment_id)
    if not pay:
        raise NotFound("payment")
    await assert_billing_owner_in_admin_domain(db, admin, pay.user_id)
    changes: dict = {}
    for field in ("amount", "status", "provider", "provider_payment_id",
                  "payment_method", "paid_at", "failure_reason"):
        value = getattr(payload, field)
        if value is not None:
            setattr(pay, field, value)
            changes[field] = float(value) if field == "amount" else (str(value) if value else None)
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_payment",
        target_type="payment", target_id=pay.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(pay)
    return await pay_with_email(db, pay)


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_admin(
    payment_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    pay = await db.get(Payment, payment_id)
    if not pay:
        raise NotFound("payment")
    await assert_billing_owner_in_admin_domain(db, admin, pay.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_payment",
        target_type="payment", target_id=pay.id,
    )
    await db.delete(pay)
    await db.commit()
