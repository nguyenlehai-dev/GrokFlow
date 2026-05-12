from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import InvalidApiKey, InvalidCredentials, PermissionDenied
from app.core.security import decode_access_token, hash_api_key
from app.models import ApiKey, User
from sqlalchemy import select


DbSession = Annotated[AsyncSession, Depends(get_db)]


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
    user = await db.get(User, payload["sub"])
    if not user or user.status != "active":
        raise InvalidCredentials()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


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
) -> tuple[ApiKey, User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise InvalidApiKey()
    raw = authorization.split(" ", 1)[1]
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
