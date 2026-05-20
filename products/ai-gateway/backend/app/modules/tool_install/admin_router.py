"""Admin CRUD for tool installs — /api/admin/auth/tool-installs/*"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.core.security import hash_password
from app.models import Plan, ToolInstall, User

from .schemas import (
    ProvisionedUserOut,
    ProvisionUserIn,
    ToolInstallAdminOut,
    ToolInstallUpdate,
)


router = APIRouter(
    prefix="/api/admin/auth/tool-installs",
    tags=["admin-auth-tool-installs"],
)


async def _serialize(db, t: ToolInstall) -> ToolInstallAdminOut:
    assigned_email: str | None = None
    if t.assigned_user_id:
        u = await db.get(User, t.assigned_user_id)
        if u:
            assigned_email = u.email
    return ToolInstallAdminOut(
        id=t.id, tool_id=t.tool_id,
        machine_name=t.machine_name, public_ip=t.public_ip,
        label=t.label, description=t.description,
        status=t.status,
        allow_all_pages=t.allow_all_pages,
        allowed_pages=list(t.allowed_pages or []),
        allow_landing=t.allow_landing,
        allow_login=t.allow_login,
        allow_register=t.allow_register,
        login_template=t.login_template,
        brand_name=t.brand_name,
        assigned_user_id=t.assigned_user_id,
        assigned_user_email=assigned_email,
        first_seen_at=t.first_seen_at, last_seen_at=t.last_seen_at,
        client_version=t.client_version,
        jobs_quota_per_day=t.jobs_quota_per_day,
        quota_reset_hour_utc=int(t.quota_reset_hour_utc or 0),
        created_at=t.created_at, updated_at=t.updated_at,
    )


@router.get("", response_model=list[ToolInstallAdminOut])
async def list_installs(
    _: SuperAdminUser, db: DbSession,
    q: str | None = Query(default=None, description="Search machine_name / tool_id / label"),
    status_filter: str | None = Query(default=None, alias="status",
                                       pattern="^(pending|active|disabled)$"),
    limit: int = Query(default=200, le=500),
) -> list[ToolInstallAdminOut]:
    stmt = select(ToolInstall)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (ToolInstall.machine_name.ilike(like))
            | (ToolInstall.tool_id.ilike(like))
            | (ToolInstall.label.ilike(like))
        )
    if status_filter:
        stmt = stmt.where(ToolInstall.status == status_filter)
    # Pending first (admin's queue), then most-recently-seen.
    stmt = stmt.order_by(
        (ToolInstall.status == "pending").desc(),
        ToolInstall.last_seen_at.desc(),
    ).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize(db, t) for t in rows]


@router.get("/{install_id}", response_model=ToolInstallAdminOut)
async def get_install(
    install_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> ToolInstallAdminOut:
    t = await db.get(ToolInstall, install_id)
    if not t:
        raise NotFound("tool_install")
    return await _serialize(db, t)


@router.patch("/{install_id}", response_model=ToolInstallAdminOut)
async def update_install(
    install_id: uuid.UUID, payload: ToolInstallUpdate,
    _: SuperAdminUser, db: DbSession,
) -> ToolInstallAdminOut:
    t = await db.get(ToolInstall, install_id)
    if not t:
        raise NotFound("tool_install")
    data = payload.model_dump(exclude_unset=True)
    if "assigned_user_id" in data and data["assigned_user_id"] is not None:
        u = await db.get(User, data["assigned_user_id"])
        if not u:
            raise InvalidPayload("Tài khoản gán không tồn tại")
    for k, v in data.items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return await _serialize(db, t)


@router.delete("/{install_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_install(
    install_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> None:
    t = await db.get(ToolInstall, install_id)
    if not t:
        raise NotFound("tool_install")
    await db.delete(t)
    await db.commit()


@router.post("/{install_id}/provision-user", response_model=ProvisionedUserOut, status_code=status.HTTP_201_CREATED)
async def provision_user(
    install_id: uuid.UUID, payload: ProvisionUserIn,
    _: SuperAdminUser, db: DbSession,
) -> ProvisionedUserOut:
    """Create a brand-new tool-scoped user account and bind it to this
    install. Use case: super_admin sees a pending install from a customer,
    wants to issue them a fresh login in one click.

    The created user:
      - has `tool_install_id` = this install (NOT bound to any domain)
      - role=user, status=active
      - can ONLY log in from this install (enforced in /api/auth/login)

    If `pin_as_only_user=true`, also sets install.assigned_user_id so
    nobody else can log in here even if they get tool-scoped accounts on
    the same install later."""
    install = await db.get(ToolInstall, install_id)
    if not install:
        raise NotFound("tool_install")
    email = str(payload.email).strip().lower()
    existing = (await db.execute(
        select(User).where(User.email == email)
    )).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {email} đã tồn tại")
    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="user",
        status="active",
        plan_id=payload.plan_id,
        domain_id=None,                    # explicit — tool users are NOT domain-scoped
        tool_install_id=install_id,
    )
    db.add(user)
    await db.flush()  # need user.id for the pin step below

    if payload.pin_as_only_user:
        install.assigned_user_id = user.id

    await db.commit()
    await db.refresh(user)
    return ProvisionedUserOut(
        id=user.id, email=user.email,
        full_name=user.full_name,
        tool_install_id=install_id,
    )
