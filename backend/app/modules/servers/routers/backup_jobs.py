"""Server backup config + history + manual trigger endpoints.

Mounted under `/api/admin/servers/`. The cron scheduler lives inside
the `server-monitor` worker (same loop as health-check + auto-reboot).
This router lets admins:

  • see + edit the per-server backup config (cron, target, paths, db, retain)
  • view backup history
  • trigger an on-demand backup ("Backup now" button)
"""
from __future__ import annotations

import uuid
from datetime import datetime

from croniter import CroniterBadCronError, croniter
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Server, ServerBackupHistory


router = APIRouter(prefix="/servers", tags=["servers-backup"])


class BackupConfigUpdate(BaseModel):
    cron: str | None = Field(default=None, max_length=100)
    target_path: str = Field(default="/opt/backups", max_length=500)
    paths: list[str] = Field(default_factory=list)
    db_name: str | None = Field(default=None, max_length=100)
    retain_days: int = Field(default=7, ge=1, le=365)

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        try:
            croniter(v)
        except (CroniterBadCronError, ValueError) as e:
            raise ValueError(f"Cron string không hợp lệ: {e}") from e
        return v


class BackupConfigOut(BaseModel):
    server_id: uuid.UUID
    cron: str | None
    target_path: str
    paths: list[str]
    db_name: str | None
    retain_days: int
    next_run_at: datetime | None
    last_backup_at: datetime | None
    last_backup_status: str | None
    last_backup_path: str | None
    last_backup_size_bytes: int | None


class BackupHistoryRow(BaseModel):
    id: uuid.UUID
    server_id: uuid.UUID
    server_label: str
    trigger: str
    triggered_by: uuid.UUID | None
    status: str
    output_path: str | None
    size_bytes: int | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None


def _next_run(cron: str | None) -> datetime | None:
    if not cron:
        return None
    try:
        return croniter(cron, datetime.utcnow()).get_next(datetime)
    except Exception:  # noqa: BLE001
        return None


async def _build_out(db: DbSession, server: Server) -> BackupConfigOut:
    last = (await db.execute(
        select(ServerBackupHistory)
        .where(ServerBackupHistory.server_id == server.id)
        .order_by(ServerBackupHistory.started_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return BackupConfigOut(
        server_id=server.id,
        cron=server.backup_schedule_cron,
        target_path=server.backup_target_path,
        paths=list(server.backup_paths or []),
        db_name=server.backup_db_name,
        retain_days=server.backup_retain_days,
        next_run_at=_next_run(server.backup_schedule_cron),
        last_backup_at=last.finished_at if last else None,
        last_backup_status=last.status if last else None,
        last_backup_path=last.output_path if last else None,
        last_backup_size_bytes=last.size_bytes if last else None,
    )


@router.get("/{server_id}/backup-config", response_model=BackupConfigOut)
async def get_config(
    server_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> BackupConfigOut:
    server = await db.get(Server, server_id)
    if not server:
        raise NotFound("server")
    return await _build_out(db, server)


@router.put("/{server_id}/backup-config", response_model=BackupConfigOut)
async def set_config(
    server_id: uuid.UUID, payload: BackupConfigUpdate,
    _: SuperAdminUser, db: DbSession,
) -> BackupConfigOut:
    server = await db.get(Server, server_id)
    if not server:
        raise NotFound("server")
    server.backup_schedule_cron = payload.cron
    server.backup_target_path = payload.target_path.strip() or "/opt/backups"
    server.backup_paths = [p.strip() for p in payload.paths if p.strip()]
    server.backup_db_name = payload.db_name.strip() if payload.db_name else None
    server.backup_retain_days = payload.retain_days
    await db.commit()
    await db.refresh(server)
    return await _build_out(db, server)


@router.post("/{server_id}/backup-now", response_model=BackupHistoryRow)
async def backup_now(
    server_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
) -> BackupHistoryRow:
    """Trigger a manual backup synchronously. Returns once tar/pg_dump
    finishes (can take minutes — UI should show a spinner)."""
    import asyncio
    from datetime import timezone
    from app.modules.servers.services.backup_runner import run_backup

    server = await db.get(Server, server_id)
    if not server:
        raise NotFound("server")
    if not (server.backup_paths or server.backup_db_name):
        raise InvalidPayload(
            "Server chưa cấu hình paths hoặc db_name — bấm 'Sửa' trước.",
        )

    row = ServerBackupHistory(
        server_id=server.id, trigger="manual", triggered_by=admin.id,
        status="running",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    result = await asyncio.to_thread(run_backup, server)

    row.status = "success" if result.success else "failed"
    row.output_path = result.output_path
    row.size_bytes = result.size_bytes
    row.error_message = None if result.success else result.message[:500]
    row.finished_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return BackupHistoryRow(
        id=row.id, server_id=row.server_id, server_label=server.label,
        trigger=row.trigger, triggered_by=row.triggered_by,
        status=row.status, output_path=row.output_path,
        size_bytes=row.size_bytes, error_message=row.error_message,
        started_at=row.started_at, finished_at=row.finished_at,
    )


@router.get("/backup-history", response_model=list[BackupHistoryRow])
async def list_history(
    _: SuperAdminUser, db: DbSession,
    server_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, le=500),
) -> list[BackupHistoryRow]:
    stmt = (
        select(ServerBackupHistory, Server.label)
        .join(Server, ServerBackupHistory.server_id == Server.id)
        .order_by(ServerBackupHistory.started_at.desc())
        .limit(limit)
    )
    if server_id:
        stmt = stmt.where(ServerBackupHistory.server_id == server_id)
    rows = (await db.execute(stmt)).all()
    out = []
    for r, label in rows:
        out.append(BackupHistoryRow(
            id=r.id, server_id=r.server_id, server_label=label,
            trigger=r.trigger, triggered_by=r.triggered_by,
            status=r.status, output_path=r.output_path,
            size_bytes=r.size_bytes, error_message=r.error_message,
            started_at=r.started_at, finished_at=r.finished_at,
        ))
    return out
