"""Audit log viewer.

Two surfaces:
  - `GET /api/audit-logs`             self-service (your own actions only)
  - `GET /api/audit-logs/admin`       admin view, scoped per domain by role

The admin view supports filters + pagination + total count so the FE can
build a multi-filter table with page controls. Per-domain admin is
auto-scoped to its own domain (joins through user.domain_id); super_admin
is unscoped but can filter by domain_id on demand.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models import AuditLog, User

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


class AuditLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    user_email: str | None
    user_role: str | None
    domain_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    ip_address: str | None
    metadata: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogPage(BaseModel):
    rows: list[AuditLogOut]
    total: int
    offset: int
    limit: int


def _row_to_out(row: AuditLog, user: User | None) -> AuditLogOut:
    """Materialise an AuditLogOut. `user` may be None when the actor was
    deleted (FK is ON DELETE SET NULL); we still emit the row so the audit
    trail stays complete — just without name/email/domain context."""
    return AuditLogOut(
        id=row.id,
        user_id=row.user_id,
        user_email=user.email if user else None,
        user_role=user.role if user else None,
        domain_id=user.domain_id if user else None,
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
    """Self-service: user sees their own audit trail only."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    rows = (await db.execute(stmt)).scalars().all()
    # Self-view: no need to re-fetch the User (it's the caller).
    return [_row_to_out(r, user) for r in rows]


@router.get("/admin", response_model=AuditLogPage)
async def list_audit_admin(
    admin: AdminUser,
    db: DbSession,
    action: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    domain_id: uuid.UUID | None = Query(
        default=None,
        description="Filter by domain. Ignored for per-domain admin (always own).",
    ),
    target_type: str | None = Query(default=None),
    target_id: uuid.UUID | None = Query(default=None),
    date_from: datetime | None = Query(default=None, description="ISO 8601 inclusive"),
    date_to: datetime | None = Query(default=None, description="ISO 8601 inclusive"),
    q: str | None = Query(
        default=None,
        description="Substring search across action + metadata as text",
    ),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
) -> AuditLogPage:
    """Admin view with filters + pagination.

    Tenancy:
      - super_admin: unscoped, can pass `domain_id` to narrow.
      - admin: auto-scoped to own domain (the `domain_id` query param is
        silently overridden to the caller's domain — we don't 403, we just
        force-scope so the FE can pass it freely without permission errors).
    """
    # Force-scope per-domain admin to its own domain.
    effective_domain = admin.domain_id if admin.role != "super_admin" else domain_id

    # Build base query joining User so we can both filter by domain + emit
    # email/role/domain_id in the response without a second roundtrip per row.
    base = (
        select(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
    )

    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if effective_domain:
        # Audit rows without a user (FK NULL after delete) are excluded when
        # filtering by domain — they have no domain to compare against.
        filters.append(User.domain_id == effective_domain)
    if target_type:
        filters.append(AuditLog.target_type == target_type)
    if target_id:
        filters.append(AuditLog.target_id == target_id)
    if date_from:
        filters.append(AuditLog.created_at >= date_from)
    if date_to:
        filters.append(AuditLog.created_at <= date_to)
    if q:
        # Cheap substring search: action ILIKE %q% OR metadata::text ILIKE %q%
        # (jsonb supports ::text cast in Postgres). Indexed only via the
        # trigram index if one exists — for now we accept the seq scan since
        # this is an admin-only endpoint with low traffic.
        like = f"%{q}%"
        filters.append(
            AuditLog.action.ilike(like)
            | func.cast(AuditLog.audit_metadata, type_=__import__("sqlalchemy").String).ilike(like)
        )

    if filters:
        base = base.where(*filters)

    # Total count for pagination — same filters, no ORDER BY / LIMIT.
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    page_stmt = base.offset(offset).limit(limit)
    rows = (await db.execute(page_stmt)).all()

    return AuditLogPage(
        rows=[_row_to_out(log, usr) for log, usr in rows],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )
