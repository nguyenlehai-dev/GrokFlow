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
from app.core.security import decode_access_token, hash_api_key, verify_password
from app.models import GwGatewayKey, User


@dataclass
class GatewayCaller:
    kind: str                                # "admin" | "gateway_key"
    user_id: uuid.UUID | None = None         # set when kind=admin
    gateway_key_id: uuid.UUID | None = None  # set when kind=gateway_key
    allowed_functions: list[str] | None = None
    label: str | None = None
    # Tenant id resolved from the caller (admin → user.domain_id,
    # gateway_key → key.domain_id). Stored on each GwRequest so per-domain
    # filtering of the requests log + dashboard works without a join.
    domain_id: uuid.UUID | None = None

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
    # Error response shapes match the first-gen gateway.plxeditor.com
    # exactly: legacy returned a flat string in `detail` (eg "Missing
    # bearer token"), v2 originally wrapped it in a {code,message} dict.
    # Customer integrations parse `resp.json()['detail']` as a string;
    # the dict shape broke type-naive callers. Keep `detail` a string
    # here, surface the code separately via a header for clients that
    # want a stable machine-readable signal.
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"X-Error-Code": "missing_auth"},
        )
    token = authorization.split(" ", 1)[1].strip()

    # Gateway key path (gwk_live_*)
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
                        domain_id=k.domain_id,
                        rate_limit_per_minute=k.rate_limit_per_minute,
                        daily_quota=k.daily_quota,
                        used_today=k.used_today,
                    )
            except Exception:  # noqa: BLE001
                continue
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"X-Error-Code": "invalid_gateway_key"},
        )

    # Unified key path — accept the standard GrokFlow personal API key
    # (uxpm_live_* by default; whatever settings.API_KEY_PREFIX is set to)
    # so operators don't have to manage two parallel key systems on the
    # same instance. Looks up in the api_keys table, returns a caller
    # scoped to the key's owner.
    #
    # IMPORTANT: api_keys table stores key_hash as SHA256 of the FULL
    # token (see core.security.generate_api_key), NOT bcrypt. Use
    # hash_api_key + constant-time compare here — bcrypt's verify_password
    # would always return False against a 64-char hex digest.
    from app.core.config import settings
    from app.models import ApiKey
    if token.startswith(settings.API_KEY_PREFIX):
        token_hash = hash_api_key(token)
        row = (await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == token_hash, ApiKey.status == "active",
            )
        )).scalar_one_or_none()
        if row is not None:
            owner = await db.get(User, row.user_id)
            return GatewayCaller(
                kind="gateway_key",
                gateway_key_id=None,  # not a gw_gateway_keys row
                allowed_functions=None,  # personal keys: no per-fn whitelist
                label=row.name,
                domain_id=(owner.domain_id if owner else None),
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"X-Error-Code": "invalid_api_key"},
        )

    # Admin JWT path
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"X-Error-Code": "invalid_token"},
        )
    user = await db.get(User, payload["sub"])
    if not user or user.status != "active" or user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"X-Error-Code": "admin_required"},
        )
    return GatewayCaller(kind="admin", user_id=user.id, domain_id=user.domain_id)


GatewayCallerDep = Depends(require_caller)
