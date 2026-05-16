"""/api/admin/servers — CRUD + live-metrics detail view."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.encryption import encrypt
from app.core.exceptions import NotFound
from app.models import Server
from app.modules.admin.audit import service as audit
from app.modules.servers.schemas import (
    ServerDetailOut,
    ServerIn,
    ServerOut,
    ServerUpdate,
)
from app.modules.servers.services.metrics import probe
from app.modules.servers.services.ssh import SshConnectError

router = APIRouter()


@router.get("/servers", response_model=list[ServerOut])
async def list_servers(_admin: SuperAdminUser, db: DbSession) -> list[Server]:
    rows = (await db.execute(select(Server).order_by(Server.created_at))).scalars().all()
    return list(rows)


@router.post("/servers", response_model=ServerOut, status_code=status.HTTP_201_CREATED)
async def create_server(
    payload: ServerIn, admin: SuperAdminUser, db: DbSession,
) -> Server:
    s = Server(
        label=payload.label,
        hostname=payload.hostname,
        ssh_user=payload.ssh_user,
        ssh_password_encrypted=encrypt(payload.ssh_password) if payload.ssh_password else None,
        ssh_key_path=payload.ssh_key_path,
        ssh_port=payload.ssh_port,
        description=payload.description,
        tags=payload.tags,
    )
    db.add(s)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="server_create",
        target_type="server", target_id=s.id,
        metadata={"label": payload.label, "hostname": payload.hostname},
    )
    await db.commit()
    await db.refresh(s)
    return s


@router.get("/servers/{server_id}", response_model=ServerDetailOut)
async def get_server(
    server_id: uuid.UUID, _admin: SuperAdminUser, db: DbSession,
) -> ServerDetailOut:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")

    metrics = None
    try:
        metrics = probe(s)
        s.status = "active"
        s.last_seen_at = datetime.now(timezone.utc)
    except SshConnectError:
        s.status = "unreachable"
    except Exception:  # noqa: BLE001 — probe parse failure is non-fatal
        s.status = "unknown"
    await db.commit()
    await db.refresh(s)

    return ServerDetailOut(
        id=s.id,
        label=s.label,
        hostname=s.hostname,
        ssh_user=s.ssh_user,
        ssh_port=s.ssh_port,
        description=s.description,
        status=s.status,  # type: ignore[arg-type]
        last_seen_at=s.last_seen_at,
        tags=s.tags,
        created_at=s.created_at,
        metrics=metrics,
    )


@router.patch("/servers/{server_id}", response_model=ServerOut)
async def update_server(
    server_id: uuid.UUID, payload: ServerUpdate, admin: SuperAdminUser, db: DbSession,
) -> Server:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")
    changes: dict = {}
    if payload.label is not None:
        s.label = payload.label; changes["label"] = payload.label
    if payload.hostname is not None:
        s.hostname = payload.hostname; changes["hostname"] = payload.hostname
    if payload.ssh_user is not None:
        s.ssh_user = payload.ssh_user
    if payload.ssh_password is not None and payload.ssh_password != "":
        s.ssh_password_encrypted = encrypt(payload.ssh_password); changes["ssh_password"] = "***"
    if payload.ssh_key_path is not None:
        s.ssh_key_path = payload.ssh_key_path or None
    if payload.ssh_port is not None:
        s.ssh_port = payload.ssh_port
    if payload.description is not None:
        s.description = payload.description
    if payload.tags is not None:
        s.tags = payload.tags
    await audit.log_action(
        db, user_id=admin.id, action="server_update",
        target_type="server", target_id=s.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(s)
    return s


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    server_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
) -> None:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")
    await audit.log_action(
        db, user_id=admin.id, action="server_delete",
        target_type="server", target_id=s.id,
        metadata={"label": s.label, "hostname": s.hostname},
    )
    await db.delete(s)
    await db.commit()
