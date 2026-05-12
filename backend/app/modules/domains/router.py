"""Domain management.

- Admin endpoints under /api/admin/domains for CRUD.
- Public GET /api/domains/config?host=xxx — frontend calls this on app boot
  to decide which pages are accessible / whether landing is shown.
"""
import uuid
from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Domain
from app.modules.audit import service as audit

router = APIRouter(tags=["domains"])


# ---------------- Schemas ----------------

class DomainIn(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|disabled)$")
    allow_landing: bool = True
    allow_register: bool = True
    allow_login: bool = True
    allow_all_pages: bool = False
    allowed_pages: list[str] = Field(default_factory=list)
    brand_name: str | None = None


class DomainUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    allow_landing: bool | None = None
    allow_register: bool | None = None
    allow_login: bool | None = None
    allow_all_pages: bool | None = None
    allowed_pages: list[str] | None = None
    brand_name: str | None = None


class DomainOut(BaseModel):
    id: uuid.UUID
    hostname: str
    label: str
    description: str | None
    status: str
    allow_landing: bool
    allow_register: bool
    allow_login: bool
    allow_all_pages: bool
    allowed_pages: list[str]
    brand_name: str | None

    class Config:
        from_attributes = True


class DomainConfig(BaseModel):
    """Public-facing config — what the frontend needs to render this host."""
    hostname: str
    label: str
    status: str
    allow_landing: bool
    allow_register: bool
    allow_login: bool
    allow_all_pages: bool
    allowed_pages: list[str]
    brand_name: str | None


# ---------------- Admin CRUD ----------------

@router.get("/api/admin/domains", response_model=list[DomainOut])
async def list_domains(admin: AdminUser, db: DbSession) -> list[Domain]:
    rows = (await db.execute(select(Domain).order_by(Domain.hostname))).scalars().all()
    return list(rows)


@router.post("/api/admin/domains", response_model=DomainOut, status_code=status.HTTP_201_CREATED)
async def create_domain(payload: DomainIn, admin: AdminUser, db: DbSession) -> Domain:
    hostname = payload.hostname.strip().lower()
    if (await db.execute(select(Domain).where(Domain.hostname == hostname))).scalar_one_or_none():
        raise InvalidPayload(f"Domain '{hostname}' đã tồn tại")
    d = Domain(
        hostname=hostname,
        label=payload.label,
        description=payload.description,
        status=payload.status,
        allow_landing=payload.allow_landing,
        allow_register=payload.allow_register,
        allow_login=payload.allow_login,
        allow_all_pages=payload.allow_all_pages,
        allowed_pages=payload.allowed_pages,
        brand_name=payload.brand_name,
    )
    db.add(d)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_domain",
        target_type="domain", target_id=d.id, metadata={"hostname": hostname},
    )
    await db.commit()
    await db.refresh(d)
    return d


@router.patch("/api/admin/domains/{domain_id}", response_model=DomainOut)
async def update_domain(
    domain_id: uuid.UUID, payload: DomainUpdate, admin: AdminUser, db: DbSession,
) -> Domain:
    d = await db.get(Domain, domain_id)
    if not d:
        raise NotFound("domain")
    changes: dict[str, Any] = {}
    for field in (
        "label", "description", "status", "allow_landing", "allow_register",
        "allow_login", "allow_all_pages", "allowed_pages", "brand_name",
    ):
        v = getattr(payload, field)
        if v is not None:
            setattr(d, field, v)
            changes[field] = v if not isinstance(v, list) else "updated"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_domain",
        target_type="domain", target_id=d.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(d)
    return d


@router.delete("/api/admin/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    d = await db.get(Domain, domain_id)
    if not d:
        raise NotFound("domain")
    if d.hostname == "*":
        raise InvalidPayload("Không xóa được domain mặc định '*'")
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_domain",
        target_type="domain", target_id=d.id, metadata={"hostname": d.hostname},
    )
    await db.delete(d)
    await db.commit()


# ---------------- Public config ----------------

@router.get("/api/domains/config", response_model=DomainConfig)
async def get_domain_config(host: str, db: DbSession) -> DomainConfig:
    """Resolve the access config for a given hostname.

    Tries exact match first, falls back to the '*' wildcard row. If even that
    is missing, returns a permissive default so the frontend doesn't lock
    itself out on a fresh install.
    """
    h = host.strip().lower()
    # Strip port for matching
    if ":" in h:
        h = h.split(":", 1)[0]

    d = (await db.execute(select(Domain).where(Domain.hostname == h))).scalar_one_or_none()
    if not d:
        d = (await db.execute(select(Domain).where(Domain.hostname == "*"))).scalar_one_or_none()
    if d:
        return DomainConfig(
            hostname=d.hostname, label=d.label, status=d.status,
            allow_landing=d.allow_landing, allow_register=d.allow_register,
            allow_login=d.allow_login, allow_all_pages=d.allow_all_pages,
            allowed_pages=d.allowed_pages, brand_name=d.brand_name,
        )
    # Fail-open default
    return DomainConfig(
        hostname=h, label=h, status="active",
        allow_landing=True, allow_register=True, allow_login=True,
        allow_all_pages=True, allowed_pages=[], brand_name=None,
    )
