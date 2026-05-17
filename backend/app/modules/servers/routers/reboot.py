"""Reboot scheduling endpoints — configure cron + view history.

Mounted under `/api/admin/servers/`. The actual reboot execution lives
in `actions.py` (manual button) and `app.workers.server_monitor` (cron
fire). This router just CRUDs the schedule + exposes the history."""
from __future__ import annotations

import uuid
from datetime import datetime

from croniter import CroniterBadCronError, croniter
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Server, ServerRebootHistory


router = APIRouter(prefix="/servers", tags=["servers-reboot"])


class RebootScheduleUpdate(BaseModel):
    """Configure auto-reboot for one server. Pass `cron=None` to disable."""
    # 5-field cron string (`min hour day month weekday`) in UTC. Examples:
    #   "0 3 * * 0"   = every Sunday 03:00 UTC
    #   "30 2 1 * *"  = 1st of every month at 02:30 UTC
    cron: str | None = Field(default=None, max_length=100)
    min_uptime_hours: int = Field(default=24, ge=0, le=720)

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


class RebootScheduleOut(BaseModel):
    server_id: uuid.UUID
    cron: str | None
    min_uptime_hours: int
    # The next time the cron will fire (UTC) — computed at read time so
    # the FE can show "Reboot kế: 03:00 Chủ nhật" without re-implementing
    # cron parsing on the client.
    next_run_at: datetime | None
    # Last completed reboot (any trigger) for context.
    last_reboot_at: datetime | None
    last_reboot_trigger: str | None
    last_reboot_status: str | None


class RebootHistoryRow(BaseModel):
    id: uuid.UUID
    server_id: uuid.UUID
    server_label: str
    trigger: str
    triggered_by: uuid.UUID | None
    status: str
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


async def _build_schedule_out(db: DbSession, server: Server) -> RebootScheduleOut:
    last = (await db.execute(
        select(ServerRebootHistory)
        .where(ServerRebootHistory.server_id == server.id)
        .order_by(ServerRebootHistory.started_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return RebootScheduleOut(
        server_id=server.id,
        cron=server.reboot_schedule_cron,
        min_uptime_hours=server.reboot_min_uptime_hours,
        next_run_at=_next_run(server.reboot_schedule_cron),
        last_reboot_at=last.finished_at if last else None,
        last_reboot_trigger=last.trigger if last else None,
        last_reboot_status=last.status if last else None,
    )


@router.get("/{server_id}/reboot-schedule", response_model=RebootScheduleOut)
async def get_schedule(
    server_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> RebootScheduleOut:
    server = await db.get(Server, server_id)
    if not server:
        raise NotFound("server")
    return await _build_schedule_out(db, server)


@router.put("/{server_id}/reboot-schedule", response_model=RebootScheduleOut)
async def set_schedule(
    server_id: uuid.UUID, payload: RebootScheduleUpdate,
    _: SuperAdminUser, db: DbSession,
) -> RebootScheduleOut:
    server = await db.get(Server, server_id)
    if not server:
        raise NotFound("server")
    server.reboot_schedule_cron = payload.cron
    server.reboot_min_uptime_hours = payload.min_uptime_hours
    await db.commit()
    await db.refresh(server)
    return await _build_schedule_out(db, server)


@router.get("/reboot-history", response_model=list[RebootHistoryRow])
async def list_history(
    _: SuperAdminUser, db: DbSession,
    server_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, le=500),
) -> list[RebootHistoryRow]:
    stmt = (
        select(ServerRebootHistory, Server.label)
        .join(Server, ServerRebootHistory.server_id == Server.id)
        .order_by(ServerRebootHistory.started_at.desc())
        .limit(limit)
    )
    if server_id:
        stmt = stmt.where(ServerRebootHistory.server_id == server_id)
    rows = (await db.execute(stmt)).all()
    out = []
    for r, label in rows:
        out.append(RebootHistoryRow(
            id=r.id, server_id=r.server_id, server_label=label,
            trigger=r.trigger, triggered_by=r.triggered_by,
            status=r.status, error_message=r.error_message,
            started_at=r.started_at, finished_at=r.finished_at,
        ))
    return out
