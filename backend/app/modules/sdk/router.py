"""Endpoints third-party modules call back into.

Two-leg auth on every endpoint:
  1. Service token — proves "this request is from module X" (X-GrokFlow-Service-Token)
  2. User token — proves "user U is operating module X" (X-GrokFlow-User-Token)

Both must be valid; either alone is not enough. The frontend iframe URL
carries the user's JWT; the module's BE forwards it verbatim to /api/sdk/*
along with the module's own service token.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.exceptions import InvalidCredentials, PermissionDenied
from app.core.security import decode_jwt
from app.models import AdminModule, User


router = APIRouter(prefix="/api/sdk", tags=["sdk"])


# ─── Auth deps ────────────────────────────────────────────────────────


async def get_caller_module(
    service_token: Annotated[str | None, Header(alias="X-GrokFlow-Service-Token")],
    db: DbSession,
) -> AdminModule:
    if not service_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing service token")
    row = (await db.execute(
        select(AdminModule).where(AdminModule.service_token == service_token)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid service token")
    if row.status != "running":
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"module {row.slug} is {row.status}")
    return row


def require_scope(scope: str):
    """Dependency factory — checks the module declared this scope at install."""
    async def _check(module: Annotated[AdminModule, Depends(get_caller_module)]) -> AdminModule:
        scopes = (module.manifest or {}).get("permissions", {}).get("scopes", []) or []
        if scope not in scopes:
            raise PermissionDenied(f"module '{module.slug}' missing scope '{scope}'")
        return module
    return _check


async def get_acting_user(
    user_token: Annotated[str | None, Header(alias="X-GrokFlow-User-Token")],
    db: DbSession,
) -> User:
    if not user_token:
        raise InvalidCredentials()
    try:
        payload = decode_jwt(user_token)
        user_id = payload.get("sub")
    except Exception as exc:  # noqa: BLE001
        raise InvalidCredentials() from exc
    if not user_id:
        raise InvalidCredentials()
    user = await db.get(User, user_id)
    if not user or user.status != "active":
        raise InvalidCredentials()
    return user


# ─── Response models ──────────────────────────────────────────────────


class VerifyResponse(BaseModel):
    user_id: str
    email: str
    role: str
    tenant_id: str | None = None
    expires_at: datetime | None = None


class UserMeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str


class TenantContextResponse(BaseModel):
    tenant_id: str | None
    hostname: str | None
    label: str | None


# ─── Endpoints ────────────────────────────────────────────────────────


@router.post("/auth/verify", response_model=VerifyResponse)
async def verify(
    user: Annotated[User, Depends(get_acting_user)],
    _module: Annotated[AdminModule, Depends(get_caller_module)],
) -> VerifyResponse:
    """Module calls this on every request to confirm the user JWT is still
    valid + which role they have. Cheap — single DB lookup."""
    return VerifyResponse(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )


@router.get("/users/me", response_model=UserMeResponse)
async def users_me(
    user: Annotated[User, Depends(get_acting_user)],
    _module: Annotated[AdminModule, Depends(get_caller_module)],
) -> UserMeResponse:
    return UserMeResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.get("/tenants/current", response_model=TenantContextResponse)
async def tenants_current(
    user: Annotated[User, Depends(get_acting_user)],
    _module: Annotated[AdminModule, Depends(get_caller_module)],
) -> TenantContextResponse:
    """Tenant context derived from the user. Phase 3 will surface a richer
    multi-tenant object; Phase 1 just echoes the user's domain row (if any)."""
    # Phase 1: trivial passthrough. Wire to user.domain when MT lands.
    return TenantContextResponse(tenant_id=None, hostname=None, label=None)
