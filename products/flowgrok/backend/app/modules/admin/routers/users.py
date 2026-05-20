"""/api/admin/users — admin CRUD over user rows."""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.core.security import hash_password
from datetime import datetime, timezone

from app.models import Plan, Subscription, User
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    EffectiveEntitlementsOut,
)
from app.modules.entitlements.service import get_effective_entitlements
from app.modules.admin.services.tenancy import (
    NULL_FK_SENTINEL,
    assert_can_touch,
    scope_users_query,
    validate_role_id_for_domain,
)

router = APIRouter()


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(admin: AdminUser, db: DbSession) -> list[User]:
    q = scope_users_query(select(User).order_by(User.created_at.desc()), admin)
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: AdminUserCreate, admin: AdminUser, db: DbSession) -> User:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")
    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")

    # Role + domain rules:
    #   super_admin can create any role in any domain (uses payload.domain_id);
    #   admin can create role=user|admin in THEIR domain only, never super_admin.
    if admin.role != "super_admin":
        if payload.role == "super_admin":
            raise PermissionDenied("Không có quyền tạo super_admin")
        target_domain = admin.domain_id  # force into admin's own domain
    else:
        target_domain = payload.domain_id

    role_id = await validate_role_id_for_domain(db, payload.role_id, target_domain)

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        status="active",
        plan_id=payload.plan_id,
        domain_id=target_domain,
        role_id=role_id,
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
    assert_can_touch(admin, user)
    if payload.role == "super_admin" and admin.role != "super_admin":
        raise PermissionDenied("Không có quyền cấp super_admin")
    if (
        payload.domain_id is not None
        and admin.role != "super_admin"
        and payload.domain_id != admin.domain_id
    ):
        raise PermissionDenied("Không có quyền chuyển user sang domain khác")
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
        if str(payload.plan_id) == NULL_FK_SENTINEL:
            user.plan_id = None
            changes["plan_id"] = None
            # Clearing plan = cancel any active manual subs.
            await db.execute(
                Subscription.__table__.update()
                .where(
                    Subscription.user_id == user.id,
                    Subscription.status == "active",
                )
                .values(status="cancelled", cancelled_at=datetime.now(timezone.utc))
            )
        else:
            new_plan = await db.get(Plan, payload.plan_id)
            if not new_plan:
                raise InvalidPayload("Plan không tồn tại")
            user.plan_id = payload.plan_id
            changes["plan_id"] = str(payload.plan_id)
            # Admin upgrade flow: the entitlement resolver requires an
            # active Subscription row to honor a paid plan (so payment
            # failures auto-downgrade). When admin grants a plan manually
            # (no billing), we still need that row → upsert one with
            # provider="manual" so resolve_user_plan_with_status picks it
            # up immediately. Cancel any non-matching active subs first.
            await db.execute(
                Subscription.__table__.update()
                .where(
                    Subscription.user_id == user.id,
                    Subscription.status == "active",
                    Subscription.plan_id != payload.plan_id,
                )
                .values(status="cancelled", cancelled_at=datetime.now(timezone.utc))
            )
            existing = (await db.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == user.id,
                    Subscription.plan_id == payload.plan_id,
                )
                .order_by(Subscription.created_at.desc())
                .limit(1)
            )).scalar_one_or_none()
            if existing:
                existing.status = "active"
                existing.cancelled_at = None
                existing.cancel_at_period_end = False
            else:
                db.add(Subscription(
                    user_id=user.id,
                    plan_id=payload.plan_id,
                    status="active",
                    billing_cycle="monthly",
                    provider="manual",
                    amount=0,
                    currency="VND",
                ))
    if payload.entitlement_overrides is not None:
        user.entitlement_overrides = payload.entitlement_overrides or None
        changes["entitlement_overrides"] = "set" if payload.entitlement_overrides else "cleared"
    if payload.domain_id is not None and admin.role == "super_admin":
        if str(payload.domain_id) == NULL_FK_SENTINEL:
            user.domain_id = None
            user.role_id = None
            changes["domain_id"] = None
        else:
            if user.domain_id != payload.domain_id:
                user.role_id = None
            user.domain_id = payload.domain_id
            changes["domain_id"] = str(payload.domain_id)
    if payload.role_id is not None:
        user.role_id = await validate_role_id_for_domain(
            db, payload.role_id, user.domain_id,
        )
        changes["role_id"] = str(user.role_id) if user.role_id else None
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
    assert_can_touch(admin, user)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_user", target_type="user", target_id=user.id,
        metadata={"email": user.email},
    )
    await db.delete(user)
    await db.commit()


@router.get("/users/{user_id}/effective-entitlements", response_model=EffectiveEntitlementsOut)
async def user_effective_entitlements(
    user_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> EffectiveEntitlementsOut:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    assert_can_touch(admin, user)
    eff = await get_effective_entitlements(db, user)
    return EffectiveEntitlementsOut(**eff)
