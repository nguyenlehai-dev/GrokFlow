"""Notifications endpoints.

  GET  /api/notifications          list (default unread, paginated)
  POST /api/notifications/{id}/read
  POST /api/notifications/read-all
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select, update, func

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound
from app.models import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    target_url: str | None
    severity: str
    read_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int
    total: int


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    user: CurrentUser, db: DbSession,
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> NotificationListOut:
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    rows = (
        await db.execute(
            base.order_by(Notification.created_at.desc())
            .offset(offset).limit(limit),
        )
    ).scalars().all()
    # Unread count is the headline number the bell icon shows.
    unread = (
        await db.execute(
            select(func.count()).select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None)),
        )
    ).scalar_one()
    total = (
        await db.execute(
            select(func.count()).select_from(Notification)
            .where(Notification.user_id == user.id),
        )
    ).scalar_one()
    return NotificationListOut(
        items=[NotificationOut.model_validate(r) for r in rows],
        unread_count=int(unread),
        total=int(total),
    )


@router.post("/{notif_id}/read")
async def mark_read(notif_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    n = await db.get(Notification, notif_id)
    if not n or n.user_id != user.id:
        raise NotFound("notification")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user: CurrentUser, db: DbSession) -> dict:
    res = await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"ok": True, "marked": res.rowcount or 0}
