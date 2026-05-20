import uuid
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import (
    AppError,
    InvalidApiKey,
    InvalidCredentials,
    PermissionDenied,
)
from app.core.security import decode_access_token, hash_api_key
from app.models import ApiKey, Domain, User
from sqlalchemy import select


DbSession = Annotated[AsyncSession, Depends(get_db)]


def _coerce_uuid(value: str | uuid.UUID) -> uuid.UUID | str:
    """JWT `sub` is a string; SQLAlchemy's Uuid type on SQLite explodes
    on strings (calls `.hex`). Coerce to uuid.UUID when possible —
    a bad-format value returns the original so the lookup raises 404
    rather than 500."""
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return value


async def _assert_domain_active(db: AsyncSession, user: User) -> None:
    """Block any API call from a tenant whose domain has been disabled
    (manual freeze, non-payment, etc). super_admin is unscoped → skip.
    Called from both `get_current_user` and `get_current_user_optional`
    so the rule is enforced on every authenticated request, not just at
    login time (an admin can disable a tenant mid-session)."""
    if user.role == "super_admin" or not user.domain_id:
        return
    domain = await db.get(Domain, user.domain_id)
    if domain and domain.status == "disabled":
        raise AppError(
            403, "domain_disabled",
            "Tenant đang bị tạm dừng. Liên hệ admin để kích hoạt lại.",
        )


async def get_current_user(
    db: DbSession,
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise InvalidCredentials()
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise InvalidCredentials()
    user = await db.get(User, _coerce_uuid(payload["sub"]))
    if not user or user.status != "active":
        raise InvalidCredentials()
    await _assert_domain_active(db, user)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_user_optional(
    db: DbSession,
    authorization: str | None = Header(default=None),
) -> User | None:
    """Like get_current_user but returns None for anonymous callers.
    Used by public endpoints that adapt behavior based on auth state
    (e.g. /api/public/try-image — anon gets 2/day IP-limited, auth gets
    plan quota)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user = await db.get(User, _coerce_uuid(payload["sub"]))
    if not user or user.status != "active":
        return None
    return user


CurrentUserOptional = Annotated[User | None, Depends(get_current_user_optional)]


# Role tiers:
#   super_admin — global super-admin (all domains)
#   admin       — per-domain admin (scoped to user.domain_id)
#   user        — regular user
#
# `AdminUser` keeps the legacy name and accepts BOTH super_admin and admin,
# so existing endpoints that don't need cross-domain authority don't break.
# Endpoints that touch global resources (plans, domains, all-users) should
# switch to `SuperAdminUser`.
def require_admin(user: CurrentUser) -> User:
    if user.role not in ("admin", "super_admin"):
        raise PermissionDenied("Admin role required")
    return user


def require_super_admin(user: CurrentUser) -> User:
    if user.role != "super_admin":
        raise PermissionDenied("Super admin role required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
SuperAdminUser = Annotated[User, Depends(require_super_admin)]


async def get_api_key_principal(
    db: DbSession,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> tuple[ApiKey, User]:
    """Accept either ``Authorization: Bearer <key>`` or ``X-API-Key: <key>``.

    Grok partner API has used Bearer since v1. Flow v1 API + future
    integrations prefer X-API-Key (industry-standard for non-OAuth APIs:
    Stripe, OpenAI, Resend, Replicate all use it). Supporting both keeps
    backwards compat without forking the dependency.
    """
    if x_api_key:
        raw = x_api_key.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1]
    else:
        raise InvalidApiKey()
    key_hash = hash_api_key(raw)
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    api_key = result.scalar_one_or_none()
    if not api_key or api_key.status != "active":
        raise InvalidApiKey()
    user = await db.get(User, api_key.user_id)
    if not user or user.status != "active":
        raise InvalidApiKey()
    return api_key, user


ApiKeyPrincipal = Annotated[tuple[ApiKey, User], Depends(get_api_key_principal)]
