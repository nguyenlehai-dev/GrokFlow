import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models import AuditLog

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


class AuditLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    ip_address: str | None
    metadata: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


def _to_out(row: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=row.id,
        user_id=row.user_id,
        action=row.action,
        target_type=row.target_type,
        target_id=row.target_id,
        ip_address=row.ip_address,
        metadata=row.audit_metadata,
        created_at=row.created_at,
    )


@router.get("", response_model=list[AuditLogOut])
async def list_audit(
    user: CurrentUser,
    db: DbSession,
    action: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
) -> list[AuditLogOut]:
    """Self-service: user xem audit của chính họ. Admin xem tất cả qua /admin endpoint."""
    stmt = select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.get("/admin", response_model=list[AuditLogOut])
async def list_audit_admin(
    _admin: AdminUser,
    db: DbSession,
    action: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
) -> list[AuditLogOut]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]
