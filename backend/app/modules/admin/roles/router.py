"""Per-domain roles — named permission sets within a tenant.

A role lives under a single domain and grants a subset of that domain's
allowed_pages. Users assigned the role inherit the role's pages instead
of the domain's whole list (intersected with the domain's list as a
safety upper bound).

Scope rules:
  - super_admin: full CRUD on every role.
  - admin:       CRUD on roles belonging to their own domain_id only.
  - user/support: no access (require_admin gates this).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.models import Domain, Role, User
from app.modules.admin.audit import service as audit

router = APIRouter(prefix="/api/admin/roles", tags=["roles"])


# ---------------- Schemas ----------------

class RoleIn(BaseModel):
    domain_id: uuid.UUID  # required on create — every role lives in a domain
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    allowed_pages: list[str] = Field(default_factory=list)
    status: str = Field(default="active", pattern="^(active|disabled)$")


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    allowed_pages: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")


class RoleOut(BaseModel):
    id: uuid.UUID
    domain_id: uuid.UUID
    name: str
    description: str | None
    allowed_pages: list[str]
    status: str
    # How many users currently have this role assigned. Useful for the admin
    # UI to flag roles that are still in use before deletion.
    user_count: int = 0
    created_at: datetime | None = None

    class Config:
        from_attributes = True


# ---------------- Helpers ----------------

def _enforce_domain_access(admin, domain_id: uuid.UUID) -> None:
    """Domain admins can only touch roles in their own domain."""
    if admin.role == "super_admin":
        return
    if admin.domain_id != domain_id:
        raise PermissionDenied("Role không thuộc domain bạn quản lý")


async def _intersect_with_domain_pages(
    db, domain_id: uuid.UUID, requested: list[str],
) -> list[str]:
    """Filter requested pages down to what the domain itself permits.

    Belt-and-suspenders: even if FE sends a path the domain didn't grant,
    we drop it so the role can't escape its domain's allowlist.
    """
    domain = await db.get(Domain, domain_id)
    if not domain:
        raise NotFound("domain")
    if domain.allow_all_pages:
        return list(requested)
    allowed = set(domain.allowed_pages or [])
    return [p for p in requested if p in allowed]


# ---------------- CRUD ----------------

@router.get("", response_model=list[RoleOut])
async def list_roles(
    admin: AdminUser, db: DbSession,
    domain_id: uuid.UUID | None = None,
) -> list[RoleOut]:
    q = select(Role).order_by(Role.name)
    if admin.role != "super_admin":
        q = q.where(Role.domain_id == admin.domain_id)
    elif domain_id:
        q = q.where(Role.domain_id == domain_id)
    rows = list((await db.execute(q)).scalars().all())

    # Bulk-count users per role in one query so listing 100 roles doesn't
    # do 100 round-trips. Empty result -> count = 0 for that role.
    counts: dict[uuid.UUID, int] = {}
    if rows:
        role_ids = [r.id for r in rows]
        count_q = (
            select(User.role_id, func.count(User.id))
            .where(User.role_id.in_(role_ids))
            .group_by(User.role_id)
        )
        for rid, cnt in (await db.execute(count_q)).all():
            counts[rid] = cnt

    return [
        RoleOut(
            id=r.id, domain_id=r.domain_id, name=r.name,
            description=r.description, allowed_pages=r.allowed_pages,
            status=r.status, user_count=counts.get(r.id, 0),
            created_at=getattr(r, "created_at", None),
        )
        for r in rows
    ]


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleIn, admin: AdminUser, db: DbSession) -> Role:
    _enforce_domain_access(admin, payload.domain_id)
    # uniqueness check (name + domain) — keeps a friendly error message
    dup = (await db.execute(
        select(Role).where(
            Role.domain_id == payload.domain_id, Role.name == payload.name,
        )
    )).scalar_one_or_none()
    if dup:
        raise InvalidPayload(f"Role '{payload.name}' đã tồn tại trong domain")
    safe_pages = await _intersect_with_domain_pages(
        db, payload.domain_id, payload.allowed_pages,
    )
    r = Role(
        domain_id=payload.domain_id,
        name=payload.name,
        description=payload.description,
        allowed_pages=safe_pages,
        status=payload.status,
    )
    db.add(r)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="create_role",
        target_type="role", target_id=r.id,
        metadata={"name": r.name, "domain_id": str(r.domain_id)},
    )
    await db.commit()
    await db.refresh(r)
    return r


@router.patch("/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: uuid.UUID, payload: RoleUpdate, admin: AdminUser, db: DbSession,
) -> Role:
    r = await db.get(Role, role_id)
    if not r:
        raise NotFound("role")
    _enforce_domain_access(admin, r.domain_id)
    changes: dict = {}
    if payload.name is not None:
        r.name = payload.name
        changes["name"] = payload.name
    if payload.description is not None:
        r.description = payload.description
        changes["description"] = "updated"
    if payload.status is not None:
        r.status = payload.status
        changes["status"] = payload.status
    if payload.allowed_pages is not None:
        r.allowed_pages = await _intersect_with_domain_pages(
            db, r.domain_id, payload.allowed_pages,
        )
        changes["allowed_pages"] = f"{len(r.allowed_pages)} pages"
    await audit.log_action(
        db, user_id=admin.id, action="update_role",
        target_type="role", target_id=r.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(r)
    return r


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_role(role_id: uuid.UUID, admin: AdminUser, db: DbSession):
    r = await db.get(Role, role_id)
    if not r:
        raise NotFound("role")
    _enforce_domain_access(admin, r.domain_id)
    await audit.log_action(
        db, user_id=admin.id, action="delete_role",
        target_type="role", target_id=r.id,
        metadata={"name": r.name, "domain_id": str(r.domain_id)},
    )
    await db.delete(r)
    await db.commit()
