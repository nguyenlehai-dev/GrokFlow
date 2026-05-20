"""User-facing billing endpoints.

Read-only for the most part — POST /checkout creates a pending order chain
(subscription + payment + invoice). With provider='manual' the user is told
to contact admin. Stripe / MoMo / VNPay integrations land in their own
modules; this router stays provider-agnostic.
"""
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Invoice, Payment, Plan, Subscription
from app.modules.admin.audit import service as audit

from .schemas import (
    BillingSummaryOut,
    CheckoutRequest,
    CheckoutResponse,
    InvoiceOut,
    PaymentOut,
    SubscriptionOut,
)
from .service import (
    get_active_subscription,
    next_invoice_number,
    period_end_for_cycle,
    price_for_cycle,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _sub_to_out(sub: Subscription, plan: Plan) -> SubscriptionOut:
    return SubscriptionOut(
        id=sub.id,
        plan_id=sub.plan_id,
        plan_code=plan.code,
        plan_name=plan.name,
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


@router.get("/me", response_model=BillingSummaryOut)
async def billing_summary(user: CurrentUser, db: DbSession) -> BillingSummaryOut:
    """Snapshot of user's billing state — current sub, pending orders, recent activity."""
    subs = (
        await db.execute(
            select(Subscription, Plan)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
        )
    ).all()

    current: SubscriptionOut | None = None
    pending: list[SubscriptionOut] = []
    for sub, plan in subs:
        out = _sub_to_out(sub, plan)
        if sub.status == "active" and current is None:
            current = out
        elif sub.status == "pending":
            pending.append(out)

    payments = (
        await db.execute(
            select(Payment)
            .where(Payment.user_id == user.id)
            .order_by(Payment.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    invoices = (
        await db.execute(
            select(Invoice)
            .where(Invoice.user_id == user.id)
            .order_by(Invoice.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    return BillingSummaryOut(
        current_subscription=current,
        pending_subscriptions=pending,
        recent_payments=[PaymentOut.model_validate(p) for p in payments],
        recent_invoices=[InvoiceOut.model_validate(i) for i in invoices],
    )


@router.post("/checkout", response_model=CheckoutResponse, status_code=201)
async def create_checkout(
    payload: CheckoutRequest, user: CurrentUser, db: DbSession
) -> CheckoutResponse:
    """Start a checkout flow.

    Creates a `pending` Subscription + `pending` Payment + `draft` Invoice. With
    provider=manual (current default), the user is told to contact admin to
    confirm the bank transfer / cash payment. Future: real providers return a
    payment_url for redirect.
    """
    plan = (await db.execute(select(Plan).where(Plan.code == payload.plan_code))).scalar_one_or_none()
    if not plan:
        raise NotFound("plan")
    if not plan.is_active:
        raise InvalidPayload("Gói này hiện không khả dụng")
    if plan.price_vnd is None:
        # Custom / Enterprise plans require sales contact, not self-serve checkout
        raise InvalidPayload(
            "Gói này cần liên hệ Sales để mua. Vui lòng gửi yêu cầu qua admin@grokflow.io."
        )

    amount = price_for_cycle(plan, payload.billing_cycle)
    now = datetime.now(timezone.utc)

    # 1) Subscription (pending)
    sub = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        status="pending",
        billing_cycle=payload.billing_cycle,
        provider=payload.provider,
        amount=amount,
        currency="VND",
    )
    db.add(sub)
    await db.flush()

    # 2) Payment (pending)
    pay = Payment(
        user_id=user.id,
        subscription_id=sub.id,
        amount=amount,
        currency="VND",
        status="pending",
        provider=payload.provider,
    )
    db.add(pay)
    await db.flush()

    # 3) Invoice (draft until payment success)
    inv_no = await next_invoice_number(db)
    inv = Invoice(
        user_id=user.id,
        subscription_id=sub.id,
        payment_id=pay.id,
        invoice_number=inv_no,
        amount=amount,
        tax=Decimal(0),
        total=amount,
        currency="VND",
        status="draft",
        issued_at=now,
        line_items=[
            {
                "description": f"{plan.name} ({payload.billing_cycle})",
                "quantity": 1,
                "amount": float(amount),
            }
        ],
        billing_info=payload.billing_info,
    )
    db.add(inv)

    await audit.log_action(
        db,
        user_id=user.id,
        action="checkout_started",
        target_type="subscription",
        target_id=sub.id,
        metadata={
            "plan": plan.code,
            "cycle": payload.billing_cycle,
            "amount": float(amount),
            "provider": payload.provider,
        },
    )

    # Ping admins so they don't have to refresh the billing list manually.
    # `domain_id=user.domain_id` scopes the broadcast to admins of THIS
    # tenant + every super_admin. Free-tier / unscoped users only reach
    # super_admins (correct behaviour).
    from app.modules.admin.notifications.service import notify_admins_async
    await notify_admins_async(
        db,
        domain_id=user.domain_id,
        kind="billing_pending_review",
        title=f"Yêu cầu nâng gói {plan.name}",
        body=(
            f"{user.email} muốn nâng lên gói {plan.name} ({payload.billing_cycle}). "
            f"Số tiền: {amount:,.0f} VND. Hóa đơn {inv_no}."
        ),
        target_url=f"/admin/billing?subscription_id={sub.id}",
        severity="info",
    )

    await db.commit()

    # No payment provider integration yet — manual instructions
    if payload.provider == "manual":
        instructions = (
            f"Đơn hàng đã ghi nhận. Vui lòng chuyển khoản số tiền {amount:,.0f} VND "
            f"đến tài khoản admin (xem trang thanh toán), ghi nội dung: "
            f"\"{inv_no}\". Admin sẽ kích hoạt gói trong 1h sau khi nhận tiền."
        )
        payment_url = None
    else:
        # Real payment-gateway integrations (Stripe/MoMo/VNPay) will plug in
        # their own URL-generation helpers here — keep this branch as the
        # explicit fallback so unknown providers fail gracefully.
        instructions = (
            f"Provider {payload.provider} chưa được tích hợp. Vui lòng chọn 'manual' "
            f"để chuyển khoản tay, hoặc liên hệ admin."
        )
        payment_url = None

    return CheckoutResponse(
        subscription_id=sub.id,
        payment_id=pay.id,
        invoice_id=inv.id,
        invoice_number=inv_no,
        amount=amount,
        currency="VND",
        status="pending",
        payment_url=payment_url,
        instructions=instructions,
    )


@router.post("/subscriptions/{subscription_id}/cancel", response_model=SubscriptionOut)
async def cancel_subscription(
    subscription_id, user: CurrentUser, db: DbSession
) -> SubscriptionOut:
    """Cancel at period end — user keeps access until current_period_end."""
    sub = await db.get(Subscription, subscription_id)
    if not sub or sub.user_id != user.id:
        raise NotFound("subscription")
    if sub.status not in ("active", "pending"):
        raise InvalidPayload(f"Không thể hủy subscription đang ở trạng thái {sub.status}")

    if sub.status == "pending":
        sub.status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)
    else:
        # Active: flag for end-of-period cancellation
        sub.cancel_at_period_end = True

    await audit.log_action(
        db,
        user_id=user.id,
        action="subscription_cancelled",
        target_type="subscription",
        target_id=sub.id,
    )
    await db.commit()
    await db.refresh(sub)
    plan = await db.get(Plan, sub.plan_id)
    return _sub_to_out(sub, plan)
