"""/api/admin/subscriptions — admin CRUD over Subscription rows.

confirm-payment is the noteworthy endpoint: takes a pending subscription
and flips status → active, marks any pending payment success, marks any
draft invoice paid, mirrors plan_id onto user.plan_id.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Invoice, Payment, Plan, Subscription, User
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import (
    AdminSubscriptionCreate,
    AdminSubscriptionOut,
    AdminSubscriptionUpdate,
)
from app.modules.admin.services.serializers import (
    sub_with_joins,
    subs_to_out,
)
from app.modules.admin.services.tenancy import (
    assert_billing_owner_in_admin_domain,
    scope_to_admin_domain,
)

router = APIRouter()


@router.get("/subscriptions", response_model=list[AdminSubscriptionOut])
async def list_subscriptions(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminSubscriptionOut]:
    q = scope_to_admin_domain(select(Subscription), Subscription.user_id, admin)
    if status_filter:
        q = q.where(Subscription.status == status_filter)
    if user_id:
        q = q.where(Subscription.user_id == user_id)
    q = q.order_by(Subscription.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await subs_to_out(db, rows)


@router.post("/subscriptions", response_model=AdminSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def create_subscription_admin(
    payload: AdminSubscriptionCreate, admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    """Admin creates a subscription directly (e.g. manual gift, comp, migrated user)."""
    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    await assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    if not await db.get(Plan, payload.plan_id):
        raise NotFound("plan")
    sub = Subscription(
        user_id=payload.user_id, plan_id=payload.plan_id, status=payload.status,
        billing_cycle=payload.billing_cycle, provider=payload.provider,
        amount=payload.amount, currency=payload.currency,
        current_period_start=payload.current_period_start,
        current_period_end=payload.current_period_end,
    )
    db.add(sub)
    await db.flush()
    if payload.status == "active":
        user = await db.get(User, payload.user_id)
        if user:
            user.plan_id = payload.plan_id
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_subscription",
        target_type="subscription", target_id=sub.id,
        metadata={"user_id": str(payload.user_id), "plan_id": str(payload.plan_id)},
    )
    await db.commit()
    await db.refresh(sub)
    return await sub_with_joins(db, sub)


@router.patch("/subscriptions/{subscription_id}", response_model=AdminSubscriptionOut)
async def update_subscription_admin(
    subscription_id: uuid.UUID, payload: AdminSubscriptionUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    changes: dict = {}
    plan_changed = False
    if payload.plan_id is not None:
        if not await db.get(Plan, payload.plan_id):
            raise NotFound("plan")
        sub.plan_id = payload.plan_id; changes["plan_id"] = str(payload.plan_id); plan_changed = True
    if payload.status is not None:
        sub.status = payload.status; changes["status"] = payload.status
    if payload.billing_cycle is not None:
        sub.billing_cycle = payload.billing_cycle; changes["billing_cycle"] = payload.billing_cycle
    if payload.provider is not None:
        sub.provider = payload.provider; changes["provider"] = payload.provider
    if payload.amount is not None:
        sub.amount = payload.amount; changes["amount"] = float(payload.amount)
    if payload.currency is not None:
        sub.currency = payload.currency
    if payload.current_period_start is not None:
        sub.current_period_start = payload.current_period_start
    if payload.current_period_end is not None:
        sub.current_period_end = payload.current_period_end
    if payload.cancel_at_period_end is not None:
        sub.cancel_at_period_end = payload.cancel_at_period_end
    # Mirror plan change to user.plan_id only when sub is active.
    if (plan_changed or payload.status == "active") and sub.status == "active":
        user = await db.get(User, sub.user_id)
        if user:
            user.plan_id = sub.plan_id
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_subscription",
        target_type="subscription", target_id=sub.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(sub)
    return await sub_with_joins(db, sub)


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription_admin(
    subscription_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_subscription",
        target_type="subscription", target_id=sub.id,
    )
    await db.delete(sub)
    await db.commit()


@router.post("/subscriptions/{subscription_id}/confirm-payment", response_model=AdminSubscriptionOut)
async def confirm_payment(
    subscription_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    """Mark a pending subscription as paid → active.

    Side effects: payment→success, invoice→paid, user.plan_id updated, period set.
    """
    from app.modules.landing.billing.service import period_end_for_cycle

    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    if sub.status != "pending":
        raise InvalidPayload(f"Subscription đang ở trạng thái {sub.status}, không phải pending")

    now = datetime.now(timezone.utc)
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = period_end_for_cycle(now, sub.billing_cycle)

    pay = (
        await db.execute(
            select(Payment).where(Payment.subscription_id == sub.id, Payment.status == "pending")
            .order_by(Payment.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if pay:
        pay.status = "success"
        pay.paid_at = now

    inv = (
        await db.execute(
            select(Invoice).where(Invoice.subscription_id == sub.id, Invoice.status == "draft")
            .order_by(Invoice.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if inv:
        inv.status = "paid"
        inv.paid_at = now

    user = await db.get(User, sub.user_id)
    if user:
        user.plan_id = sub.plan_id

    await audit.log_action(
        db, user_id=admin.id, action="admin_confirm_payment", target_type="subscription",
        target_id=sub.id, metadata={"user_id": str(sub.user_id), "amount": float(sub.amount)},
    )

    # Notify the buyer — their plan just unlocked. Includes plan name in
    # the title so it shows up actionable in the bell dropdown; target_url
    # links back to their billing page where the new invoice lives.
    if user and sub.plan_id:
        from app.models import Plan as PlanModel
        from app.modules.admin.notifications.service import log_notification_async
        plan = await db.get(PlanModel, sub.plan_id)
        plan_label = plan.name if plan else "Pro"
        await log_notification_async(
            db,
            user_id=user.id,
            kind="billing_confirmed",
            title=f"Đã kích hoạt gói {plan_label}",
            body=(
                f"Thanh toán {sub.amount:,.0f} {sub.currency} đã được admin xác nhận. "
                f"Bạn có thể dùng đủ tính năng của gói {plan_label} ngay bây giờ."
            ),
            target_url="/billing",
            severity="info",
        )

    await db.commit()
    await db.refresh(sub)
    return await sub_with_joins(db, sub)
