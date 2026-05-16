"""/api/admin/servers/{id}/backups — restore-point listing + actions.

v1: returns 5 synthetic restore points so the FE backup history sidebar
has something to render. Real backups (zfs snapshot / rsync / borg) ship
in a follow-up — that's where the storage backend decision happens.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status as http_status
from sqlalchemy import select  # noqa: F401  — future: filter by server_id

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import NotFound
from app.models import Server
from app.modules.admin.audit import service as audit
from app.modules.servers.schemas import ServerActionResponse, ServerBackupOut

router = APIRouter()


def _synthetic_backups(server_id: uuid.UUID) -> list[ServerBackupOut]:
    """Five weekly restore points ending today (synthetic until storage lands)."""
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[ServerBackupOut] = []
    for i in range(5):
        ts = now - timedelta(days=7 * (4 - i))
        out.append(ServerBackupOut(
            id=f"bkp-{server_id}-{i}",
            server_id=server_id,
            created_at=ts.replace(hour=i * 4),
            size_gb=12.4,
            status="complete",
        ))
    return out


@router.get("/servers/{server_id}/backups", response_model=list[ServerBackupOut])
async def list_backups(
    server_id: uuid.UUID, _admin: SuperAdminUser, db: DbSession,
) -> list[ServerBackupOut]:
    if not await db.get(Server, server_id):
        raise NotFound("server")
    return _synthetic_backups(server_id)


@router.post(
    "/servers/{server_id}/backups/{backup_id}/restore",
    response_model=ServerActionResponse,
    status_code=http_status.HTTP_200_OK,
)
async def restore_backup(
    server_id: uuid.UUID, backup_id: str,
    admin: SuperAdminUser, db: DbSession,
) -> ServerActionResponse:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")
    # Real restore would: pause the host, swap in the snapshot, boot. For
    # now we just audit the click so the trail is there for when it's wired.
    await audit.log_action(
        db, user_id=admin.id, action="server_restore_backup",
        target_type="server", target_id=s.id,
        metadata={"backup_id": backup_id},
    )
    await db.commit()
    return ServerActionResponse(
        ok=True,
        message=(
            "Backup restore chưa được tích hợp với storage backend — "
            "hành động đã được ghi log."
        ),
        status=s.status,  # type: ignore[arg-type]
    )


@router.delete(
    "/servers/{server_id}/backups/{backup_id}",
    response_model=ServerActionResponse,
    status_code=http_status.HTTP_200_OK,
)
async def delete_backup(
    server_id: uuid.UUID, backup_id: str,
    admin: SuperAdminUser, db: DbSession,
) -> ServerActionResponse:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")
    await audit.log_action(
        db, user_id=admin.id, action="server_delete_backup",
        target_type="server", target_id=s.id,
        metadata={"backup_id": backup_id},
    )
    await db.commit()
    return ServerActionResponse(
        ok=True,
        message="Backup đã được xoá khỏi danh sách (synthetic).",
        status=s.status,  # type: ignore[arg-type]
    )
