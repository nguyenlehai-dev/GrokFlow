import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.core.security import hash_password
from app.models import ApiKey, Invoice, Job, Payment, Plan, Profile, Subscription, User
from app.modules.audit import service as audit
from app.modules.entitlements.catalog import FEATURES, LIMITS
from app.modules.entitlements.service import get_effective_entitlements

from .schemas import (
    AdminStats,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    EffectiveEntitlementsOut,
    EntitlementCatalogOut,
    PlanIn,
    PlanOut,
    PlanUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def stats(_admin: AdminUser, db: DbSession) -> AdminStats:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_keys = (await db.execute(select(func.count(ApiKey.id)))).scalar_one()
    total_profiles = (await db.execute(select(func.count(Profile.id)))).scalar_one()
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar_one()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    succ = (
        await db.execute(select(func.count(Job.id)).where(Job.status == "success", Job.completed_at >= cutoff))
    ).scalar_one()
    fail = (
        await db.execute(select(func.count(Job.id)).where(Job.status == "failed", Job.completed_at >= cutoff))
    ).scalar_one()
    return AdminStats(
        total_users=total_users,
        total_api_keys=total_keys,
        total_profiles=total_profiles,
        total_jobs=total_jobs,
        jobs_24h_success=succ,
        jobs_24h_failed=fail,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(_admin: AdminUser, db: DbSession) -> list[User]:
    rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return list(rows)


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: AdminUserCreate, admin: AdminUser, db: DbSession) -> User:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")
    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        status="active",
        plan_id=payload.plan_id,
    )
    db.add(user)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_user", target_type="user", target_id=user.id,
        metadata={"email": user.email, "role": user.role, "plan_id": str(payload.plan_id) if payload.plan_id else None},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, admin: AdminUser, db: DbSession) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    changes: dict = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.role is not None:
        user.role = payload.role
        changes["role"] = payload.role
    if payload.status is not None:
        user.status = payload.status
        changes["status"] = payload.status
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changes["password"] = "***"
    if payload.plan_id is not None:
        # Allow setting plan_id to a sentinel uuid 0...0 to clear it.
        if str(payload.plan_id) == "00000000-0000-0000-0000-000000000000":
            user.plan_id = None
            changes["plan_id"] = None
        else:
            if not await db.get(Plan, payload.plan_id):
                raise InvalidPayload("Plan không tồn tại")
            user.plan_id = payload.plan_id
            changes["plan_id"] = str(payload.plan_id)
    if payload.entitlement_overrides is not None:
        # Empty dict means "clear overrides".
        user.entitlement_overrides = payload.entitlement_overrides or None
        changes["entitlement_overrides"] = "set" if payload.entitlement_overrides else "cleared"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_user", target_type="user", target_id=user.id,
        metadata=changes,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    if user_id == admin.id:
        raise InvalidPayload("Không thể tự xóa chính mình")
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_user", target_type="user", target_id=user.id,
        metadata={"email": user.email},
    )
    await db.delete(user)
    await db.commit()


@router.get("/users/{user_id}/effective-entitlements", response_model=EffectiveEntitlementsOut)
async def user_effective_entitlements(
    user_id: uuid.UUID, _admin: AdminUser, db: DbSession,
) -> EffectiveEntitlementsOut:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    eff = await get_effective_entitlements(db, user)
    return EffectiveEntitlementsOut(**eff)


# ---------- Plans CRUD ----------


@router.get("/entitlements/catalog", response_model=EntitlementCatalogOut)
async def entitlement_catalog(_admin: AdminUser) -> EntitlementCatalogOut:
    """List of feature/limit keys + Vietnamese labels for the admin UI."""
    return EntitlementCatalogOut(features=FEATURES, limits=LIMITS)


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(_admin: AdminUser, db: DbSession) -> list[Plan]:
    rows = (await db.execute(select(Plan).order_by(Plan.sort_order, Plan.created_at))).scalars().all()
    return list(rows)


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(payload: PlanIn, admin: AdminUser, db: DbSession) -> Plan:
    if (await db.execute(select(Plan).where(Plan.code == payload.code))).scalar_one_or_none():
        raise InvalidPayload(f"Plan code '{payload.code}' đã tồn tại")
    if payload.is_default:
        # At most one default — clear flag on others.
        for p in (await db.execute(select(Plan).where(Plan.is_default.is_(True)))).scalars().all():
            p.is_default = False
    plan = Plan(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        is_default=payload.is_default,
        sort_order=payload.sort_order,
        price_vnd=payload.price_vnd,
        price_usd_cents=payload.price_usd_cents,
        is_active=payload.is_active,
        entitlements=payload.entitlements,
    )
    db.add(plan)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_plan", target_type="plan", target_id=plan.id,
        metadata={"code": plan.code},
    )
    await db.commit()
    await db.refresh(plan)
    return plan


@router.patch("/plans/{plan_id}", response_model=PlanOut)
async def update_plan(plan_id: uuid.UUID, payload: PlanUpdate, admin: AdminUser, db: DbSession) -> Plan:
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise NotFound("plan")
    changes: dict = {}
    if payload.name is not None:
        plan.name = payload.name; changes["name"] = payload.name
    if payload.description is not None:
        plan.description = payload.description; changes["description"] = "updated"
    if payload.sort_order is not None:
        plan.sort_order = payload.sort_order; changes["sort_order"] = payload.sort_order
    if payload.is_default is not None:
        if payload.is_default:
            for p in (await db.execute(
                select(Plan).where(Plan.is_default.is_(True), Plan.id != plan.id)
            )).scalars().all():
                p.is_default = False
        plan.is_default = payload.is_default
        changes["is_default"] = payload.is_default
    if payload.price_vnd is not None:
        plan.price_vnd = payload.price_vnd; changes["price_vnd"] = payload.price_vnd
    if payload.price_usd_cents is not None:
        plan.price_usd_cents = payload.price_usd_cents
        changes["price_usd_cents"] = payload.price_usd_cents
    if payload.is_active is not None:
        plan.is_active = payload.is_active; changes["is_active"] = payload.is_active
    if payload.entitlements is not None:
        plan.entitlements = payload.entitlements
        changes["entitlements"] = "updated"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_plan", target_type="plan", target_id=plan.id,
        metadata=changes,
    )
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(plan_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise NotFound("plan")
    # FK on users.plan_id is ON DELETE SET NULL — affected users fall back to default plan.
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_plan", target_type="plan", target_id=plan.id,
        metadata={"code": plan.code},
    )
    await db.delete(plan)
    await db.commit()


# ============================================================================
# Billing — admin reconciliation
# ============================================================================

@router.get("/subscriptions")
async def list_subscriptions(admin: AdminUser, db: DbSession, status_filter: str | None = None) -> list[dict]:
    """List all subscriptions across users — for admin reconciliation dashboard."""
    q = select(Subscription, User.email, Plan.code).join(User, User.id == Subscription.user_id).join(
        Plan, Plan.id == Subscription.plan_id
    )
    if status_filter:
        q = q.where(Subscription.status == status_filter)
    q = q.order_by(Subscription.created_at.desc()).limit(200)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": str(s.id),
            "user_id": str(s.user_id),
            "user_email": email,
            "plan_id": str(s.plan_id),
            "plan_code": plan_code,
            "status": s.status,
            "billing_cycle": s.billing_cycle,
            "provider": s.provider,
            "amount": float(s.amount),
            "currency": s.currency,
            "current_period_start": s.current_period_start.isoformat() if s.current_period_start else None,
            "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
            "cancel_at_period_end": s.cancel_at_period_end,
            "created_at": s.created_at.isoformat(),
        }
        for s, email, plan_code in rows
    ]


@router.post("/subscriptions/{subscription_id}/confirm-payment")
async def confirm_payment(subscription_id: uuid.UUID, admin: AdminUser, db: DbSession) -> dict:
    """Mark a pending subscription as paid → active, update user.plan_id.

    Use this after manually verifying a bank transfer for provider=manual orders.
    Side effects:
      - Subscription.status: pending → active
      - Subscription.current_period_start/end populated
      - Payment.status: pending → success, paid_at set
      - Invoice.status: draft → paid
      - User.plan_id ← subscription.plan_id (user gets new entitlements)
    """
    from app.modules.billing.service import period_end_for_cycle

    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    if sub.status != "pending":
        raise InvalidPayload(f"Subscription đang ở trạng thái {sub.status}, không phải pending")

    now = datetime.now(timezone.utc)
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = period_end_for_cycle(now, sub.billing_cycle)

    # Find the matching payment + invoice
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

    # Update user's plan
    user = await db.get(User, sub.user_id)
    if user:
        user.plan_id = sub.plan_id

    await audit.log_action(
        db, user_id=admin.id, action="admin_confirm_payment", target_type="subscription",
        target_id=sub.id, metadata={"user_id": str(sub.user_id), "amount": float(sub.amount)},
    )
    await db.commit()
    return {"ok": True, "subscription_id": str(sub.id), "status": "active"}
