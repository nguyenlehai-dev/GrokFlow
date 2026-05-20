"""Admin tenancy helpers — who can see / touch what.

Wraps the generic primitives from `app.core.tenant` so admin routers
don't have to know which column to scope on (`User.domain_id` vs
`Subscription.user_id` → User.domain_id). Also defines the
`NULL_FK_SENTINEL` the FE uses to clear nullable foreign keys.
"""

from __future__ import annotations

import uuid

from app.core.exceptions import InvalidPayload, PermissionDenied
from app.core.tenant import (
    assert_same_domain,
    assert_user_in_admin_domain,
    bulk_fetch_map,
    scope_by_domain,
    scope_by_user_domain,
)
from app.models import Role, User

# Sentinel the FE sends to mean "clear this nullable FK" (PATCH bodies
# can't tell None from "not present" otherwise). Kept identical on FE
# side as `NULL_FK_SENTINEL` in frontend/src/modules/admin/AdminPage.tsx.
NULL_FK_SENTINEL = "00000000-0000-0000-0000-000000000000"


async def validate_role_id_for_domain(
    db, role_id: uuid.UUID | None, domain_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Ensure a role_id (when set) belongs to the same domain as the user.

    Returns the role_id to assign, or None when the caller passed the zero-uuid
    sentinel (interpreted as "clear the role").
    """
    if role_id is None:
        return None
    if str(role_id) == NULL_FK_SENTINEL:
        return None
    role = await db.get(Role, role_id)
    if not role:
        raise InvalidPayload("Role không tồn tại")
    if domain_id is None or role.domain_id != domain_id:
        raise InvalidPayload("Role phải thuộc cùng domain với user")
    return role_id


def scope_users_query(q, admin: User):
    """Compat alias — admin/users endpoints scope by users.domain_id directly."""
    return scope_by_domain(q, User.domain_id, admin)


def assert_can_touch(admin: User, target: User) -> None:
    """Raise if a domain admin tries to act on a user outside their domain.

    Also forbids any non-super admin from touching a super_admin row (tier
    escalation guard). Wraps the generic `assert_same_domain` core helper.
    """
    assert_same_domain(admin, target.domain_id)
    if admin.role != "super_admin" and target.role == "super_admin":
        raise PermissionDenied("Không có quyền sửa super_admin")


def scope_to_admin_domain(q, user_id_column, admin: User):
    """Thin alias over app.core.tenant.scope_by_user_domain — picks the
    right column for billing rows (which use `user_id`)."""
    return scope_by_user_domain(q, user_id_column, admin)


async def assert_billing_owner_in_admin_domain(db, admin: User, user_id):
    """Verify the user owning a billing row sits inside the admin's domain."""
    return await assert_user_in_admin_domain(db, admin, user_id)


# Re-export so sub-routers don't need to know about `app.core.tenant`.
__all__ = [
    "NULL_FK_SENTINEL",
    "validate_role_id_for_domain",
    "scope_users_query",
    "assert_can_touch",
    "scope_to_admin_domain",
    "assert_billing_owner_in_admin_domain",
    "bulk_fetch_map",
]
