"""Seed a 3-layer permission demo — Domain × Role × Plan.

Demonstrates the FULL stack of access control:
  • Domain.allowed_pages   = which pages this tenant offers
  • Role.allowed_pages     = which subset a named role gets within the domain
  • Plan.entitlements      = which features + limits the user pays for
  • User.role tier         = super_admin / admin / user (tier-level gates)

Two demo tenants:

  agency.local                       studio.local
  ┌────────────────────────┐         ┌────────────────────────┐
  │ Pages:                  │         │ Pages:                  │
  │   /dashboard            │         │   /dashboard            │
  │   /grok/profiles        │         │   /grok/profiles        │
  │   /grok/jobs            │         │   /grok/jobs            │
  │   /flow/cut             │         │   /gateway/playground   │
  │   /flow/merge           │         │   /api-keys             │
  │   /api-keys             │         │ Roles:                  │
  │ Roles:                  │         │   • Member  (all)       │
  │   • Editor (jobs+flow)  │         │ Users:                  │
  │   • Viewer (dashboard)  │         │   alice@studio  → Member│
  │ Users:                  │         │     Pro plan            │
  │   bob@agency  → Editor   │         └────────────────────────┘
  │     Free plan           │
  │   carol@agency → Editor  │
  │     Pro plan            │
  │   dave@agency → Viewer   │
  │     Pro plan            │
  │   eve@agency  → (none)   │  ← inherits FULL domain pages
  │     Free plan           │
  └────────────────────────┘

Test matrix the seed proves:
  bob   — sees /dashboard /grok/jobs /flow/cut /flow/merge — but NO video feature (Free plan)
  carol — same pages as bob — AND video feature unlocked (Pro plan)
  dave  — only /dashboard — Pro plan wasted on him (Viewer role too narrow)
  eve   — sees ALL agency pages — Free plan limits apply
  alice — sees studio pages only — Pro plan + Member role unlock everything in studio

Password for all users: Demo@123456
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Domain, Invoice, Payment, Plan, Role, Subscription, User


PASSWORD = "Demo@123456"


async def ensure_domain(db, *, hostname: str, label: str, pages: list[str]) -> Domain:
    d = (await db.execute(select(Domain).where(Domain.hostname == hostname))).scalar_one_or_none()
    if d:
        d.label = label
        d.allowed_pages = pages
        d.allow_all_pages = False
        d.status = "active"
        return d
    d = Domain(
        hostname=hostname, label=label,
        status="active",
        allow_landing=True, allow_register=True, allow_login=True,
        allow_all_pages=False,
        allowed_pages=pages,
        brand_name=label,
        require_playground_key=False,
    )
    db.add(d)
    await db.flush()
    return d


async def ensure_role(db, *, domain: Domain, name: str, pages: list[str]) -> Role:
    r = (await db.execute(
        select(Role).where(Role.domain_id == domain.id, Role.name == name)
    )).scalar_one_or_none()
    if r:
        r.allowed_pages = pages
        r.status = "active"
        return r
    r = Role(
        domain_id=domain.id, name=name,
        description=f"{name} role in {domain.label}",
        allowed_pages=pages, status="active",
    )
    db.add(r)
    await db.flush()
    return r


async def ensure_user(
    db, *, email: str, full_name: str,
    domain: Domain, role: Role | None, plan: Plan,
) -> User:
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if u:
        u.domain_id = domain.id
        u.role_id = role.id if role else None
        u.plan_id = plan.id
    else:
        u = User(
            email=email, password_hash=hash_password(PASSWORD),
            full_name=full_name, role="user", status="active",
            domain_id=domain.id, role_id=role.id if role else None,
            plan_id=plan.id,
        )
        db.add(u)
    await db.flush()

    # Non-free plans need a backing Subscription(active) — otherwise
    # `resolve_user_plan_with_status` treats them as unpaid and falls
    # back to the default plan. We create one paid cycle that ends in
    # 25 days so the entitlement gate honors the upgrade.
    if plan.code != "free":
        await ensure_active_subscription(db, u, plan)
    return u


async def ensure_active_subscription(db, user: User, plan: Plan) -> None:
    existing = (await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.plan_id == plan.id)
    )).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    period_start = now - timedelta(days=5)
    period_end = now + timedelta(days=25)
    amount = Decimal(str(plan.price_vnd or 0))

    if existing:
        existing.status = "active"
        existing.current_period_start = period_start
        existing.current_period_end = period_end
        existing.amount = amount
        return

    sub = Subscription(
        user_id=user.id, plan_id=plan.id, status="active",
        billing_cycle="monthly", provider="manual",
        amount=amount, currency="VND",
        current_period_start=period_start,
        current_period_end=period_end,
    )
    db.add(sub)
    await db.flush()
    pay = Payment(
        user_id=user.id, subscription_id=sub.id,
        amount=amount, currency="VND", status="success",
        provider="manual", payment_method="bank_transfer",
        paid_at=now,
    )
    db.add(pay)
    await db.flush()
    inv = Invoice(
        user_id=user.id, subscription_id=sub.id, payment_id=pay.id,
        invoice_number=f"INV-TENANT-{user.email.split('@')[0]}",
        amount=amount, tax=Decimal("0"), total=amount,
        currency="VND", status="paid",
        issued_at=now, paid_at=now,
        line_items=[{"description": f"{plan.name} — chu kỳ tháng", "amount": float(amount), "quantity": 1}],
    )
    db.add(inv)


async def main() -> int:
    async with SessionLocal() as db:
        free = (await db.execute(select(Plan).where(Plan.code == "free"))).scalar_one()
        pro = (await db.execute(select(Plan).where(Plan.code == "pro"))).scalar_one()

        # ─── Agency tenant ───────────────────────────────────────────
        agency = await ensure_domain(db,
            hostname="agency.local",
            label="Agency Studio",
            pages=[
                "/dashboard", "/grok/profiles", "/grok/jobs",
                "/flow/cut", "/flow/merge", "/api-keys",
            ],
        )
        agency_editor = await ensure_role(db,
            domain=agency, name="Editor",
            pages=["/grok/profiles", "/grok/jobs", "/flow/cut", "/flow/merge"],
        )
        agency_viewer = await ensure_role(db,
            domain=agency, name="Viewer",
            pages=["/dashboard"],
        )

        await ensure_user(db, email="bob@agency.local",  full_name="Bob (Editor · Free)",
                          domain=agency, role=agency_editor, plan=free)
        await ensure_user(db, email="carol@agency.local",full_name="Carol (Editor · Pro)",
                          domain=agency, role=agency_editor, plan=pro)
        await ensure_user(db, email="dave@agency.local", full_name="Dave (Viewer · Pro)",
                          domain=agency, role=agency_viewer, plan=pro)
        await ensure_user(db, email="eve@agency.local",  full_name="Eve (no role · Free)",
                          domain=agency, role=None, plan=free)

        # ─── Studio tenant ──────────────────────────────────────────
        studio = await ensure_domain(db,
            hostname="studio.local",
            label="Studio Co.",
            pages=[
                "/dashboard", "/grok/profiles", "/grok/jobs",
                "/gateway/playground", "/api-keys",
            ],
        )
        studio_member = await ensure_role(db,
            domain=studio, name="Member",
            pages=["/dashboard", "/grok/profiles", "/grok/jobs", "/gateway/playground", "/api-keys"],
        )
        await ensure_user(db, email="alice@studio.local",full_name="Alice (Member · Pro)",
                          domain=studio, role=studio_member, plan=pro)

        await db.commit()

        print("\n=== Seeded ===")
        print(f"Domain agency.local: {len(agency.allowed_pages)} pages, 2 roles, 4 users")
        print(f"Domain studio.local: {len(studio.allowed_pages)} pages, 1 role,  1 user")
        print(f"\nAll passwords: {PASSWORD}\n")
        print("Test matrix:")
        print("  bob@agency.local    Editor + Free  -> sees jobs/flow pages, NO video feature")
        print("  carol@agency.local  Editor + Pro   -> sees jobs/flow pages, video unlocked")
        print("  dave@agency.local   Viewer + Pro   -> sees only /dashboard (role too narrow)")
        print("  eve@agency.local    NO role + Free -> sees ALL agency pages (inherit domain)")
        print("  alice@studio.local  Member + Pro   -> sees studio pages, no /flow/* (domain doesn't grant)")
        print("\nLogin each and check the sidebar — the menu shrinks/grows per the matrix above.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
