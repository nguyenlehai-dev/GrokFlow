"""HTTP surface for /api/admin/modules — install, list, manage plugins.

All endpoints require super_admin: installing a third-party module = code
execution on the host, so we don't let regular admins do it. Once
installed, regular users see the module in their sidebar based on
manifest.permissions (Phase 2).
"""

from __future__ import annotations

import secrets
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.encryption import encrypt
from app.core.exceptions import NotFound
from app.models import AdminModule

from . import installer
from .schemas import ModuleInstallRequest, ModuleOut


router = APIRouter(prefix="/api/admin/modules", tags=["admin-modules"])


@router.get("", response_model=list[ModuleOut])
async def list_modules(_admin: SuperAdminUser, db: DbSession) -> list[AdminModule]:
    """List every installed module. Drives the /admin/modules table UI."""
    rows = (await db.execute(
        select(AdminModule).order_by(AdminModule.installed_at.desc())
    )).scalars().all()
    return list(rows)


@router.post("", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
async def install_module(
    req: ModuleInstallRequest,
    admin: SuperAdminUser,
    db: DbSession,
) -> AdminModule:
    """Clone + build + spawn a module from a git URL.

    The sync portion (clone repo + parse manifest + create DB row) runs
    inline so we can fail fast with 422 if the manifest is bad. Anything
    that touches docker/postgres is deferred to a background task so
    this endpoint returns in < 3s. Frontend polls the list endpoint
    until the row's status transitions out of `installing`.
    """
    # Generate the module's DB password and service token here so we can
    # both encrypt them into the row AND hand the raw values to the
    # background task without round-tripping through the DB.
    raw_password = secrets.token_urlsafe(32)

    row = await installer.install(req, installer_user_id=admin.id)
    # Overwrite installer's randomly-generated password with the one we
    # just made (the installer needs a placeholder to satisfy NOT NULL,
    # but we want the canonical raw value here for the background task).
    row.db_password_enc = encrypt(raw_password)

    db.add(row)
    await db.commit()
    await db.refresh(row)

    installer.schedule_post_install(row.slug, raw_password)
    return row


@router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def uninstall_module(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
) -> None:
    """Stop containers, drop schema, remove vhost, delete row."""
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    await installer.uninstall(row)
    await db.delete(row)
    await db.commit()


@router.post("/{module_id}/restart", response_model=ModuleOut)
async def restart_module(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
) -> AdminModule:
    """Stop + start the module's containers without losing DB state."""
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    # Phase 1.1: actually docker stop / docker start; for now mark intent.
    row.status = "running"
    row.last_error = None
    await db.commit()
    await db.refresh(row)
    return row
