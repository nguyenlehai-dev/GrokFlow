"""Dual auth for gateway client endpoints.

Accepts either:
- a GrokFlow admin JWT (Authorization: Bearer eyJ…) — for the in-house
  Playground page where admin tests the gateway.
- a gateway key (Authorization: Bearer gwk_live_…) — for external clients
  using the gateway as an API.

Returns a `GatewayCaller` describing which path matched + restrictions.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.security import decode_access_token, verify_password
from app.models import GwGatewayKey, User


@dataclass
class GatewayCaller:
    kind: str                                # "admin" | "gateway_key"
    user_id: uuid.UUID | None = None         # set when kind=admin
    gateway_key_id: uuid.UUID | None = None  # set when kind=gateway_key
    allowed_functions: list[str] | None = None
    label: str | None = None

    # Snapshot of the gateway-key row (only populated when kind=gateway_key)
    rate_limit_per_minute: int = 0
    daily_quota: int = 0
    used_today: int = 0

    def can_call_function(self, function_code: str) -> bool:
        if self.kind == "admin":
            return True
        if not self.allowed_functions:
            # Empty list = all functions allowed
            return True
        return function_code in self.allowed_functions


async def require_caller(
    db: DbSession,
    authorization: str | None = Header(default=None),
) -> GatewayCaller:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_auth", "message": "Authorization: Bearer <token> required"},
        )
    token = authorization.split(" ", 1)[1].strip()

    # Gateway key path
    if token.startswith("gwk_"):
        prefix = token[:12]
        rows = (await db.execute(
            select(GwGatewayKey).where(
                GwGatewayKey.prefix == prefix, GwGatewayKey.status == "active",
            )
        )).scalars().all()
        for k in rows:
            try:
                if verify_password(token, k.key_hash):
                    return GatewayCaller(
                        kind="gateway_key",
                        gateway_key_id=k.id,
                        allowed_functions=list(k.allowed_functions or []),
                        label=k.label,
                        rate_limit_per_minute=k.rate_limit_per_minute,
                        daily_quota=k.daily_quota,
                        used_today=k.used_today,
                    )
            except Exception:  # noqa: BLE001
                continue
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_gateway_key", "message": "Gateway key không hợp lệ hoặc đã revoke"},
        )

    # Admin JWT path
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Token không hợp lệ"},
        )
    user = await db.get(User, payload["sub"])
    if not user or user.status != "active" or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "admin_required", "message": "Admin JWT required cho non-gateway-key calls"},
        )
    return GatewayCaller(kind="admin", user_id=user.id)


GatewayCallerDep = Depends(require_caller)
