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
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.encryption import encrypt
from app.core.exceptions import InvalidPayload, NotFound
from app.models import AdminModule, TenantModule
from app.modules.admin.audit import service as audit
from app.services import module_runtime as rt

from . import installer
from .schemas import (
    ModuleInstallRequest, ModuleOut, ModuleSettingsUpdate,
    TenantModuleOut, TenantModuleToggle,
)


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

    await audit.log_action(
        db, user_id=admin.id, action="install_module",
        target_type="admin_module", target_id=row.id,
        metadata={"slug": row.slug, "git_url": req.git_url, "git_ref": req.git_ref},
    )
    await db.commit()

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
    await audit.log_action(
        db, user_id=_admin.id, action="uninstall_module",
        target_type="admin_module", target_id=row.id,
        metadata={"slug": row.slug},
    )
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
    # Stop containers; docker --restart=unless-stopped policy will not
    # bring them back since we did an explicit stop. We restart them
    # ourselves below.
    rt.stop_containers(row.slug)
    # Re-spawn — re-use the existing manifest snapshot and decrypted
    # password from the DB row.
    from app.core.encryption import decrypt
    pw = decrypt(row.db_password_enc)
    manifest = row.manifest
    fe_tag = row.fe_image_tag or f"grokflow-mod-{row.slug}-fe:{row.version}"
    be_tag = row.be_image_tag or f"grokflow-mod-{row.slug}-be:{row.version}"
    try:
        be_id = rt.spawn_backend(row.slug, manifest, be_tag,
                                 row.db_user, pw, row.db_schema, row.service_token)
        fe_id = rt.spawn_frontend(row.slug, manifest, fe_tag)
        row.be_container_id = be_id
        row.fe_container_id = fe_id
        row.status = "running"
        row.last_error = None
    except Exception as exc:  # noqa: BLE001
        row.status = "error"
        row.last_error = str(exc)[:1000]
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{module_id}/logs", response_class=PlainTextResponse)
async def module_logs(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
    kind: str = "be",
    tail: int = 200,
) -> str:
    """Plain-text tail of one of the module's container logs.

    `kind=be` (default) for backend logs, `kind=fe` for frontend (less
    useful — nginx access log). Used by the admin UI's log-viewer modal.
    """
    if kind not in ("fe", "be"):
        raise NotFound("log stream")
    if not 1 <= tail <= 2000:
        tail = 200
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    return rt.get_logs(row.slug, kind=kind, tail=tail) or "(no logs)"


@router.get("/{module_id}/runtime")
async def module_runtime_status(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
) -> dict:
    """Per-container status snapshot (state, started_at, restart_count,
    health). Used by the admin UI's expandable status panel."""
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    return {"slug": row.slug, "containers": rt.get_status(row.slug)}


@router.post("/{module_id}/update", response_model=ModuleOut)
async def update_module(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
) -> AdminModule:
    """Pull the latest commit from the module's git_url, rebuild images,
    swap containers. On health-check failure, the previous containers
    stay running (the new build is discarded) so the user never sees
    downtime from a bad update.

    Returns immediately with status=updating; the heavy steps run in the
    same background-task pattern as install.
    """
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    if row.status == "installing":
        raise InvalidPayload("module is still installing, wait for completion")
    row.status = "updating"
    row.last_error = None
    await db.commit()
    await db.refresh(row)

    # Schedule the actual update work — installer.schedule_update reuses
    # the install pipeline but starts from "git pull instead of clone".
    installer.schedule_update(row.slug)
    await audit.log_action(
        db, user_id=_admin.id, action="update_module",
        target_type="admin_module", target_id=row.id,
        metadata={"slug": row.slug, "git_ref": row.git_ref},
    )
    await db.commit()
    return row


# ─── Phase 3.2 — per-module settings ──────────────────────────────────


@router.patch("/{module_id}/settings", response_model=ModuleOut)
async def update_module_settings(
    module_id: UUID,
    payload: ModuleSettingsUpdate,
    _admin: SuperAdminUser,
    db: DbSession,
) -> AdminModule:
    """Replace the module's settings blob. The module's BE can read its
    own settings via /api/sdk/settings (no schema validation enforced
    here — the manifest's settings_schema is informational for the UI)."""
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    row.settings = payload.settings or {}
    await db.commit()
    await db.refresh(row)
    return row


# ─── Phase 3.1 — tenant enablement ────────────────────────────────────


@router.get("/{module_id}/tenants", response_model=list[TenantModuleOut])
async def list_module_tenants(
    module_id: UUID,
    _admin: SuperAdminUser,
    db: DbSession,
) -> list[TenantModule]:
    rows = (await db.execute(
        select(TenantModule).where(TenantModule.module_id == module_id)
    )).scalars().all()
    return list(rows)


@router.post("/{module_id}/tenants", response_model=TenantModuleOut)
async def toggle_module_tenant(
    module_id: UUID,
    payload: TenantModuleToggle,
    _admin: SuperAdminUser,
    db: DbSession,
) -> TenantModule:
    """Enable / disable the module for a specific tenant (domain).

    Idempotent — upserts the (domain_id, module_id) row. To fully revoke,
    POST with enabled=false (the row stays so audit + reactivate is easy).
    """
    row = await db.get(AdminModule, module_id)
    if not row:
        raise NotFound("module")
    tm = await db.get(TenantModule, (payload.domain_id, module_id))
    if tm is None:
        tm = TenantModule(domain_id=payload.domain_id, module_id=module_id,
                          enabled=payload.enabled)
        db.add(tm)
    else:
        tm.enabled = payload.enabled
    await db.commit()
    return tm
