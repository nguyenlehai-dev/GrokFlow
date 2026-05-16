"""/api/admin/plans — super_admin CRUD over Plan rows.

All mutations live behind SuperAdminUser; the list endpoint accepts any
admin (per-domain admins read plans to populate the user-edit form).
"""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Plan
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import PlanIn, PlanOut, PlanUpdate

router = APIRouter()


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(_admin: AdminUser, db: DbSession) -> list[Plan]:
    rows = (await db.execute(select(Plan).order_by(Plan.sort_order, Plan.created_at))).scalars().all()
    return list(rows)


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(payload: PlanIn, admin: SuperAdminUser, db: DbSession) -> Plan:
    if (await db.execute(select(Plan).where(Plan.code == payload.code))).scalar_one_or_none():
        raise InvalidPayload(f"Plan code '{payload.code}' đã tồn tại")
    if payload.is_default:
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
async def update_plan(plan_id: uuid.UUID, payload: PlanUpdate, admin: SuperAdminUser, db: DbSession) -> Plan:
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
async def delete_plan(plan_id: uuid.UUID, admin: SuperAdminUser, db: DbSession) -> None:
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
