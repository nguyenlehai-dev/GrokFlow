"""Seed sample billing data — one user per Subscription state.

Run after `seed_local.py` (which created the default plan + super_admin):

    DATABASE_URL="sqlite+aiosqlite:///./local.db" python seed_billing_flow.py

Creates:
  - A `pro` Plan (paid tier) so we have something to subscribe to.
  - 5 demo users, each on a different point in the billing lifecycle:
      active@demo.test     — paid, currently subscribed
      pending@demo.test    — awaiting payment confirmation
      pastdue@demo.test    — last cycle's payment failed
      expired@demo.test    — period ended, downgraded to free
      cancelled@demo.test  — user cancelled, still in grace period
  - One Subscription per user matching that status.
  - One Payment + Invoice per subscription (in the matching state).

All passwords: `Demo@123456` so you can log in as any of them and watch
the SubscriptionBanner change colour + the BillingPage layout adapt.

Idempotent — safe to re-run.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Invoice, Payment, Plan, Subscription, User


DEMO_PASSWORD = "Demo@123456"


async def ensure_pro_plan(db) -> Plan:
    """Seed a paid 'pro' plan that users can subscribe to."""
    pro = (await db.execute(select(Plan).where(Plan.code == "pro"))).scalar_one_or_none()
    if pro:
        return pro
    pro = Plan(
        code="pro",
        name="Pro",
        description="Demo paid plan — used by the billing-flow seed.",
        is_default=False,
        sort_order=10,
        is_active=True,
        price_vnd=590_000,
        price_usd_cents=2500,  # $25.00
        entitlements={
            "features": {
                "job.image": True,
                "job.video": True,
                "image.quality_high": True,
            },
            "limits": {
                "monthly_jobs": 10_000,
                "max_concurrent_jobs": 5,
            },
        },
    )
    db.add(pro)
    await db.commit()
    await db.refresh(pro)
    print(f"OK plan seeded: {pro.code}")
    return pro


async def ensure_user(db, email: str, full_name: str, plan_id) -> User:
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if u:
        # Keep plan_id in sync with the demo state — if you re-run after
        # editing the script's plan assignment, the row updates instead
        # of getting orphaned in the old state.
        u.plan_id = plan_id
        return u
    u = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        full_name=full_name,
        role="user",
        status="active",
        plan_id=plan_id,
    )
    db.add(u)
    await db.flush()
    return u


async def ensure_subscription_state(
    db, user: User, plan: Plan, *, status: str,
    invoice_status: str, payment_status: str,
    monthly_amount: Decimal,
    period_offset_days: int = 0,
) -> None:
    """Force the user's subscription chain into a specific state.

    `period_offset_days`:
      positive  → current_period_end in the future (active / pending / cancelled)
      negative  → period already ended (past_due / expired)
    """
    now = datetime.now(timezone.utc)
    sub_q = (
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.plan_id == plan.id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = (await db.execute(sub_q)).scalar_one_or_none()

    period_start = now - timedelta(days=30) if period_offset_days <= 0 else now - timedelta(days=5)
    period_end = now + timedelta(days=period_offset_days) if period_offset_days != 0 else now - timedelta(days=2)

    if sub is None:
        sub = Subscription(
            user_id=user.id,
            plan_id=plan.id,
            status=status,
            billing_cycle="monthly",
            provider="manual",
            amount=monthly_amount,
            currency="VND",
            current_period_start=period_start,
            current_period_end=period_end,
            cancel_at_period_end=(status == "cancelled"),
            cancelled_at=now if status == "cancelled" else None,
        )
        db.add(sub)
        await db.flush()
    else:
        sub.status = status
        sub.amount = monthly_amount
        sub.current_period_start = period_start
        sub.current_period_end = period_end
        sub.cancel_at_period_end = status == "cancelled"
        sub.cancelled_at = now if status == "cancelled" else None

    # One Payment per subscription — created (or refreshed) in the matching state.
    pay_q = (
        select(Payment)
        .where(Payment.subscription_id == sub.id)
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    pay = (await db.execute(pay_q)).scalar_one_or_none()
    if pay is None:
        pay = Payment(
            user_id=user.id,
            subscription_id=sub.id,
            amount=monthly_amount,
            currency="VND",
            status=payment_status,
            provider="manual",
            payment_method="bank_transfer",
            paid_at=now if payment_status == "success" else None,
            failure_reason="Insufficient funds (demo)" if payment_status == "failed" else None,
        )
        db.add(pay)
    else:
        pay.status = payment_status
        pay.paid_at = now if payment_status == "success" else None
        pay.failure_reason = "Insufficient funds (demo)" if payment_status == "failed" else None

    await db.flush()

    # One Invoice per subscription.
    inv_q = (
        select(Invoice)
        .where(Invoice.subscription_id == sub.id)
        .order_by(Invoice.created_at.desc())
        .limit(1)
    )
    inv = (await db.execute(inv_q)).scalar_one_or_none()
    inv_no = f"INV-DEMO-{user.email.split('@')[0]}"
    line_items = [
        {"description": f"{plan.name} — chu kỳ tháng", "amount": float(monthly_amount), "quantity": 1},
    ]
    if inv is None:
        inv = Invoice(
            user_id=user.id,
            subscription_id=sub.id,
            payment_id=pay.id,
            invoice_number=inv_no,
            amount=monthly_amount,
            tax=Decimal("0"),
            total=monthly_amount,
            currency="VND",
            status=invoice_status,
            issued_at=now if invoice_status != "draft" else None,
            paid_at=now if invoice_status == "paid" else None,
            line_items=line_items,
        )
        db.add(inv)
    else:
        inv.status = invoice_status
        inv.issued_at = now if invoice_status != "draft" else None
        inv.paid_at = now if invoice_status == "paid" else None
        inv.line_items = line_items

    await db.commit()
    print(
        f"OK {user.email:24s}  sub={status:9s}  pay={payment_status:8s}  inv={invoice_status:6s}"
    )


async def main() -> int:
    async with SessionLocal() as db:
        pro = await ensure_pro_plan(db)

        # Each tuple is (email, full_name, sub_status, pay_status, inv_status, period_offset_days)
        DEMOS = [
            ("active@demo.test",    "Demo · Active",    "active",    "success", "paid",   25),
            ("pending@demo.test",   "Demo · Pending",   "pending",   "pending", "draft",  0),
            ("pastdue@demo.test",   "Demo · Past Due",  "past_due",  "failed",  "issued", -3),
            ("expired@demo.test",   "Demo · Expired",   "expired",   "success", "paid",   -45),
            ("cancelled@demo.test", "Demo · Cancelled", "cancelled", "success", "paid",   20),
        ]

        print(f"\nSeeding {len(DEMOS)} demo users on plan '{pro.code}' …\n")
        for email, name, sub_status, pay_status, inv_status, offset in DEMOS:
            user = await ensure_user(db, email, name, pro.id)
            await ensure_subscription_state(
                db, user, pro,
                status=sub_status,
                payment_status=pay_status,
                invoice_status=inv_status,
                monthly_amount=Decimal("590000"),
                period_offset_days=offset,
            )

        print(f"\nDone. Login at http://localhost:5173/")
        print(f"  password for all demo users: {DEMO_PASSWORD}\n")
        print("Suggested test flow:")
        print("  1. Login as pending@demo.test    → blue banner ‘Đang chờ xác nhận’")
        print("  2. Switch to pastdue@demo.test   → amber banner ‘Gia hạn’")
        print("  3. Switch to expired@demo.test   → red banner ‘Mở lại gói’")
        print("  4. Switch to cancelled@demo.test → slate banner ‘Đăng ký lại’")
        print("  5. Switch to active@demo.test    → no banner (full Pro features)\n")
        print("As super_admin, go to /admin/billing → Subscriptions tab to confirm")
        print("the pending row → status flips to active in real time.\n")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
