"""Per-tenant scoping primitives — reusable across modules.

The multi-tenant model puts a `domain_id` on every per-tenant resource
(users, gateway keys, requests, …). Modules that expose admin-side CRUD
have to repeatedly answer two questions:

  1. "What rows can THIS admin see?"  → scope a list query.
  2. "Can THIS admin touch THIS row?" → assert on a single fetched row.

This module centralizes both so every router writes the same rule. Drop
it into any module by importing the two helpers; super_admin always
bypasses, per-domain admin is scoped to `user.domain_id`.
"""
from __future__ import annotations

import uuid
from typing import TypeVar

from sqlalchemy import ColumnElement, Select, select

from app.core.exceptions import PermissionDenied
from app.models import User

T = TypeVar("T")


# ---------------------------------------------------------------------------
# List scoping
# ---------------------------------------------------------------------------

def scope_by_domain(
    q: Select,
    domain_column: ColumnElement,
    admin: User,
) -> Select:
    """Narrow a query so a non-super admin only sees rows whose `domain_id`
    column matches theirs.

    Use for tables that carry domain_id directly (users, gw_gateway_keys,
    gw_requests, …). For tables that reference domain through a foreign
    User column (billing rows), use `scope_by_user_domain` instead.

    super_admin → no filter.
    admin / user / support → q.where(domain_column == admin.domain_id).
    """
    if admin.role == "super_admin":
        return q
    return q.where(domain_column == admin.domain_id)


def scope_by_user_domain(
    q: Select,
    user_id_column: ColumnElement,
    admin: User,
) -> Select:
    """Narrow a query whose rows belong to a User (via FK), to only Users
    that share the admin's domain.

    Used by billing endpoints (subscriptions/payments/invoices) where the
    row itself has no domain_id — we join through users.domain_id.
    """
    if admin.role == "super_admin":
        return q
    return q.where(user_id_column.in_(
        select(User.id).where(User.domain_id == admin.domain_id),
    ))


# ---------------------------------------------------------------------------
# Single-row guards
# ---------------------------------------------------------------------------

def assert_same_domain(admin: User, row_domain_id: uuid.UUID | None) -> None:
    """Raise PermissionDenied if `row.domain_id` doesn't match the admin's
    own domain. super_admin always passes. NULL row_domain_id means
    "unscoped row" — only super_admin can touch it.
    """
    if admin.role == "super_admin":
        return
    if row_domain_id is None or row_domain_id != admin.domain_id:
        raise PermissionDenied("Bản ghi không thuộc domain bạn quản lý")


async def assert_user_in_admin_domain(
    db, admin: User, target_user_id: uuid.UUID | None,
) -> None:
    """For rows owned by a User (e.g. a Payment with user_id), ensure the
    owning user is in the admin's domain. Pulls the User row to check.
    No-op for super_admin and for unscoped rows.
    """
    if admin.role == "super_admin" or not target_user_id:
        return
    owner = await db.get(User, target_user_id)
    if not owner or owner.domain_id != admin.domain_id:
        raise PermissionDenied("Bản ghi không thuộc domain bạn quản lý")


# ---------------------------------------------------------------------------
# Bulk fetching — antidote to N+1 in list endpoints
# ---------------------------------------------------------------------------

async def bulk_fetch_map(
    db, model: type[T], ids: set[uuid.UUID],
) -> dict[uuid.UUID, T]:
    """Fetch many rows by primary key in a single SELECT … WHERE id IN (…).

    Returns {id: row}. Empty input → empty dict (no query). The standard
    way to dodge N+1 when a list endpoint needs to enrich each row with
    one or more related entities.
    """
    if not ids:
        return {}
    result = await db.execute(select(model).where(model.id.in_(ids)))
    return {row.id: row for row in result.scalars().all()}
