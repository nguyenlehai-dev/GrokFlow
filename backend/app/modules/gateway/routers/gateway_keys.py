"""/api/v1/gateway/gateway-keys — keys issued to external API clients (gwk_live_*)."""

import secrets
import uuid

from fastapi import APIRouter, status as http_status
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.exceptions import NotFound
from app.core.security import hash_password, verify_password
from app.models import GwGatewayKey
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s
from app.modules.gateway.services.scoping import scope_keys_query

router = APIRouter()


@router.get("/gateway-keys", response_model=list[s.GatewayKeyOut])
async def list_gateway_keys(admin: AdminUser, db: DbSession) -> list[GwGatewayKey]:
    q = scope_keys_query(
        select(GwGatewayKey).order_by(GwGatewayKey.created_at.desc()), admin,
    )
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


@router.post(
    "/gateway-keys", response_model=s.GatewayKeyCreated,
    status_code=http_status.HTTP_201_CREATED,
)
async def create_gateway_key(
    payload: s.GatewayKeyIn, admin: AdminUser, db: DbSession,
) -> s.GatewayKeyCreated:
    # Generate a token like gwk_live_<32 random chars>
    raw = "gwk_live_" + secrets.token_urlsafe(24).rstrip("=")
    prefix = raw[:12]
    key_hash = hash_password(raw)
    # Bind the key to the admin's domain. super_admin can override via
    # payload.domain_id if they want to issue a key for a specific tenant;
    # an unscoped key (None) is super-only.
    target_domain = admin.domain_id
    if admin.role == "super_admin" and payload.domain_id is not None:
        target_domain = payload.domain_id
    k = GwGatewayKey(
        label=payload.label, prefix=prefix, key_hash=key_hash,
        allowed_functions=payload.allowed_functions, status="active",
        created_by=admin.id,
        domain_id=target_domain,
        webhook_url=payload.webhook_url,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        daily_quota=payload.daily_quota,
    )
    db.add(k)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_gateway_key",
        target_type="gw_gateway_key", target_id=k.id, metadata={"label": payload.label},
    )
    await db.commit()
    await db.refresh(k)
    return s.GatewayKeyCreated(
        id=k.id, label=k.label, prefix=k.prefix,
        allowed_functions=k.allowed_functions, status=k.status,
        webhook_url=k.webhook_url,
        rate_limit_per_minute=k.rate_limit_per_minute,
        daily_quota=k.daily_quota, used_today=k.used_today,
        created_at=k.created_at, domain_id=k.domain_id, plain_key=raw,
    )


@router.patch("/gateway-keys/{key_id}", response_model=s.GatewayKeyOut)
async def update_gateway_key(
    key_id: uuid.UUID, payload: s.GatewayKeyUpdate, admin: AdminUser, db: DbSession,
) -> GwGatewayKey:
    k = await db.get(GwGatewayKey, key_id)
    if not k:
        raise NotFound("gateway_key")
    if admin.role != "super_admin" and k.domain_id != admin.domain_id:
        raise NotFound("gateway_key")  # 404 not 403 — don't reveal foreign keys exist
    for field, value in payload.model_dump(exclude_unset=True).items():
        # Block a domain admin from re-tagging a key into another domain.
        if field == "domain_id" and admin.role != "super_admin":
            continue
        setattr(k, field, value)
    await audit.log_action(
        db, user_id=admin.id, action="gw_update_gateway_key",
        target_type="gw_gateway_key", target_id=k.id,
    )
    await db.commit()
    await db.refresh(k)
    return k


@router.delete("/gateway-keys/{key_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def revoke_gateway_key(key_id: uuid.UUID, admin: AdminUser, db: DbSession):
    k = await db.get(GwGatewayKey, key_id)
    if not k:
        raise NotFound("gateway_key")
    if admin.role != "super_admin" and k.domain_id != admin.domain_id:
        raise NotFound("gateway_key")
    await db.delete(k)
    await db.commit()


@router.post("/gateway-keys/verify", response_model=s.GatewayKeyVerifyResponse)
async def verify_gateway_key(
    payload: s.GatewayKeyVerifyRequest, db: DbSession,
) -> s.GatewayKeyVerifyResponse:
    """Verify a gateway API key — used by Playground + partner sanity
    checks. Public; no Authorization header required.

    Legacy gateway.plxeditor.com clients post `{"gateway_api_key": "..."}`,
    v2 clients post `{"key": "..."}` — schema accepts both via
    effective_key.

    On success: 200 with `{verified: true, label, allowed_functions}`.
    On failure: 401 with `{"detail": "Invalid gateway API key"}` — same
    shape as the legacy product so customer code that branches on
    status code or `detail` string keeps working.
    """
    key_value = payload.effective_key
    if key_value:
        prefix = key_value[:12]
        rows = (await db.execute(
            select(GwGatewayKey).where(GwGatewayKey.prefix == prefix, GwGatewayKey.status == "active")
        )).scalars().all()
        for k in rows:
            try:
                if verify_password(key_value, k.key_hash):
                    return s.GatewayKeyVerifyResponse(
                        verified=True, label=k.label,
                        allowed_functions=k.allowed_functions,
                    )
            except Exception:  # noqa: BLE001
                continue
    # Match legacy: invalid (or empty) keys → 401 with string detail.
    from fastapi import HTTPException, status as http_status
    raise HTTPException(
        status_code=http_status.HTTP_401_UNAUTHORIZED,
        detail="Invalid gateway API key",
        headers={"X-Error-Code": "invalid_gateway_key"},
    )
