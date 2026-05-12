"""LLM Gateway management — vendors / pools / functions / requests / keys.

Layout inspired by gateway.plxeditor.com — admin manages an inventory of
upstream LLM vendors, creates pools of API keys per (vendor, function,
model), and issues gateway keys to external clients. The /execute and
/submit endpoints are placeholders for now — actual vendor routing logic
lives in services/gateway_router.py (Phase 2).
"""
from __future__ import annotations

import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status as http_status
from sqlalchemy import func, select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.core.security import hash_password, verify_password
from app.models import (
    GwApiFunction, GwGatewayKey, GwPool, GwPoolApiKey, GwRequest, GwVendor,
)
from app.modules.audit import service as audit

from . import schemas as s

router = APIRouter(prefix="/api/v1/gateway", tags=["gateway"])


# ============================================================================
# Vendors
# ============================================================================

@router.get("/vendors", response_model=list[s.VendorOut])
async def list_vendors(admin: AdminUser, db: DbSession) -> list[GwVendor]:
    rows = (await db.execute(select(GwVendor).order_by(GwVendor.name))).scalars().all()
    return list(rows)


@router.post("/vendors", response_model=s.VendorOut, status_code=http_status.HTTP_201_CREATED)
async def create_vendor(payload: s.VendorIn, admin: AdminUser, db: DbSession) -> GwVendor:
    existing = (await db.execute(
        select(GwVendor).where(GwVendor.code == payload.code)
    )).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Vendor code '{payload.code}' đã tồn tại")
    v = GwVendor(**payload.model_dump())
    db.add(v)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_vendor",
        target_type="gw_vendor", target_id=v.id, metadata={"code": payload.code},
    )
    await db.commit()
    await db.refresh(v)
    return v


@router.patch("/vendors/{vendor_id}", response_model=s.VendorOut)
async def update_vendor(
    vendor_id: uuid.UUID, payload: s.VendorUpdate, admin: AdminUser, db: DbSession,
) -> GwVendor:
    v = await db.get(GwVendor, vendor_id)
    if not v:
        raise NotFound("vendor")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(v, field, value)
    await audit.log_action(
        db, user_id=admin.id, action="gw_update_vendor",
        target_type="gw_vendor", target_id=v.id,
    )
    await db.commit()
    await db.refresh(v)
    return v


@router.delete("/vendors/{vendor_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_vendor(vendor_id: uuid.UUID, admin: AdminUser, db: DbSession):
    v = await db.get(GwVendor, vendor_id)
    if not v:
        raise NotFound("vendor")
    await audit.log_action(
        db, user_id=admin.id, action="gw_delete_vendor",
        target_type="gw_vendor", target_id=v.id, metadata={"code": v.code},
    )
    await db.delete(v)
    await db.commit()


# ============================================================================
# API Functions
# ============================================================================

@router.get("/functions", response_model=list[s.ApiFunctionOut])
async def list_functions(admin: AdminUser, db: DbSession) -> list[GwApiFunction]:
    rows = (await db.execute(select(GwApiFunction).order_by(GwApiFunction.name))).scalars().all()
    return list(rows)


@router.post("/functions", response_model=s.ApiFunctionOut, status_code=http_status.HTTP_201_CREATED)
async def create_function(payload: s.ApiFunctionIn, admin: AdminUser, db: DbSession) -> GwApiFunction:
    existing = (await db.execute(
        select(GwApiFunction).where(GwApiFunction.code == payload.code)
    )).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Function code '{payload.code}' đã tồn tại")
    fn = GwApiFunction(**payload.model_dump())
    db.add(fn)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_function",
        target_type="gw_function", target_id=fn.id, metadata={"code": payload.code},
    )
    await db.commit()
    await db.refresh(fn)
    return fn


@router.patch("/functions/{function_id}", response_model=s.ApiFunctionOut)
async def update_function(
    function_id: uuid.UUID, payload: s.ApiFunctionUpdate, admin: AdminUser, db: DbSession,
) -> GwApiFunction:
    fn = await db.get(GwApiFunction, function_id)
    if not fn:
        raise NotFound("function")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(fn, field, value)
    await db.commit()
    await db.refresh(fn)
    return fn


@router.delete("/functions/{function_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_function(function_id: uuid.UUID, admin: AdminUser, db: DbSession):
    fn = await db.get(GwApiFunction, function_id)
    if not fn:
        raise NotFound("function")
    await db.delete(fn)
    await db.commit()


# ============================================================================
# Pools
# ============================================================================

async def _pool_to_out(db, pool: GwPool) -> s.PoolOut:
    vendor = await db.get(GwVendor, pool.vendor_id)
    fn = await db.get(GwApiFunction, pool.function_id) if pool.function_id else None
    keys_total = (await db.execute(
        select(func.count()).select_from(GwPoolApiKey).where(GwPoolApiKey.pool_id == pool.id)
    )).scalar() or 0
    keys_active = (await db.execute(
        select(func.count()).select_from(GwPoolApiKey).where(
            GwPoolApiKey.pool_id == pool.id, GwPoolApiKey.status == "active",
        )
    )).scalar() or 0
    return s.PoolOut(
        id=pool.id,
        vendor_id=pool.vendor_id,
        vendor_name=vendor.name if vendor else "",
        function_id=pool.function_id,
        function_name=fn.name if fn else None,
        code=pool.code,
        name=pool.name,
        model=pool.model,
        description=pool.description,
        status=pool.status,
        keys_total=keys_total,
        keys_active=keys_active,
        created_at=pool.created_at,
    )


@router.get("/pools", response_model=list[s.PoolOut])
async def list_pools(admin: AdminUser, db: DbSession) -> list[s.PoolOut]:
    rows = (await db.execute(select(GwPool).order_by(GwPool.name))).scalars().all()
    return [await _pool_to_out(db, p) for p in rows]


@router.post("/pools", response_model=s.PoolOut, status_code=http_status.HTTP_201_CREATED)
async def create_pool(payload: s.PoolIn, admin: AdminUser, db: DbSession) -> s.PoolOut:
    if not await db.get(GwVendor, payload.vendor_id):
        raise NotFound("vendor")
    if payload.function_id and not await db.get(GwApiFunction, payload.function_id):
        raise NotFound("function")
    p = GwPool(**payload.model_dump())
    db.add(p)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_pool",
        target_type="gw_pool", target_id=p.id, metadata={"code": payload.code},
    )
    await db.commit()
    await db.refresh(p)
    return await _pool_to_out(db, p)


@router.patch("/pools/{pool_id}", response_model=s.PoolOut)
async def update_pool(
    pool_id: uuid.UUID, payload: s.PoolUpdate, admin: AdminUser, db: DbSession,
) -> s.PoolOut:
    p = await db.get(GwPool, pool_id)
    if not p:
        raise NotFound("pool")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    await db.commit()
    await db.refresh(p)
    return await _pool_to_out(db, p)


@router.delete("/pools/{pool_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_pool(pool_id: uuid.UUID, admin: AdminUser, db: DbSession):
    p = await db.get(GwPool, pool_id)
    if not p:
        raise NotFound("pool")
    await db.delete(p)
    await db.commit()


# ============================================================================
# Pool API Keys
# ============================================================================

def _pool_key_to_out(k: GwPoolApiKey) -> s.PoolApiKeyOut:
    return s.PoolApiKeyOut(
        id=k.id, pool_id=k.pool_id, name=k.name,
        key_prefix=(k.api_key[:6] if k.api_key else ""),
        project_id=k.project_id, priority=k.priority,
        status=k.status, last_used_at=k.last_used_at,
        used_count=k.used_count, created_at=k.created_at,
    )


@router.get("/pools/{pool_id}/keys", response_model=list[s.PoolApiKeyOut])
async def list_pool_keys(
    pool_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> list[s.PoolApiKeyOut]:
    pool = await db.get(GwPool, pool_id)
    if not pool:
        raise NotFound("pool")
    rows = (await db.execute(
        select(GwPoolApiKey).where(GwPoolApiKey.pool_id == pool_id)
        .order_by(GwPoolApiKey.priority.desc(), GwPoolApiKey.name)
    )).scalars().all()
    return [_pool_key_to_out(k) for k in rows]


@router.post("/pools/{pool_id}/keys", response_model=s.PoolApiKeyOut, status_code=http_status.HTTP_201_CREATED)
async def add_pool_key(
    pool_id: uuid.UUID, payload: s.PoolApiKeyIn, admin: AdminUser, db: DbSession,
) -> s.PoolApiKeyOut:
    pool = await db.get(GwPool, pool_id)
    if not pool:
        raise NotFound("pool")
    k = GwPoolApiKey(pool_id=pool_id, **payload.model_dump())
    db.add(k)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_add_pool_key",
        target_type="gw_pool_key", target_id=k.id, metadata={"pool_id": str(pool_id), "name": payload.name},
    )
    await db.commit()
    await db.refresh(k)
    return _pool_key_to_out(k)


@router.patch("/pools/{pool_id}/keys/{key_id}", response_model=s.PoolApiKeyOut)
async def update_pool_key(
    pool_id: uuid.UUID, key_id: uuid.UUID, payload: s.PoolApiKeyUpdate,
    admin: AdminUser, db: DbSession,
) -> s.PoolApiKeyOut:
    k = await db.get(GwPoolApiKey, key_id)
    if not k or k.pool_id != pool_id:
        raise NotFound("pool_key")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(k, field, value)
    await db.commit()
    await db.refresh(k)
    return _pool_key_to_out(k)


@router.delete(
    "/pools/{pool_id}/keys/{key_id}",
    status_code=http_status.HTTP_204_NO_CONTENT, response_model=None,
)
async def delete_pool_key(
    pool_id: uuid.UUID, key_id: uuid.UUID, admin: AdminUser, db: DbSession,
):
    k = await db.get(GwPoolApiKey, key_id)
    if not k or k.pool_id != pool_id:
        raise NotFound("pool_key")
    await db.delete(k)
    await db.commit()


# ============================================================================
# Gateway Keys (issued to external clients)
# ============================================================================

@router.get("/gateway-keys", response_model=list[s.GatewayKeyOut])
async def list_gateway_keys(admin: AdminUser, db: DbSession) -> list[GwGatewayKey]:
    rows = (await db.execute(
        select(GwGatewayKey).order_by(GwGatewayKey.created_at.desc())
    )).scalars().all()
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
    k = GwGatewayKey(
        label=payload.label, prefix=prefix, key_hash=key_hash,
        allowed_functions=payload.allowed_functions, status="active",
        created_by=admin.id,
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
        created_at=k.created_at, plain_key=raw,
    )


@router.delete("/gateway-keys/{key_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def revoke_gateway_key(key_id: uuid.UUID, admin: AdminUser, db: DbSession):
    k = await db.get(GwGatewayKey, key_id)
    if not k:
        raise NotFound("gateway_key")
    await db.delete(k)
    await db.commit()


@router.post("/gateway-keys/verify", response_model=s.GatewayKeyVerifyResponse)
async def verify_gateway_key(
    payload: s.GatewayKeyVerifyRequest, user: CurrentUser, db: DbSession,
) -> s.GatewayKeyVerifyResponse:
    """Used by the Playground to verify a key before letting the user run.
    Lookup by prefix, then bcrypt-verify the full key.
    """
    prefix = payload.key[:12]
    rows = (await db.execute(
        select(GwGatewayKey).where(GwGatewayKey.prefix == prefix, GwGatewayKey.status == "active")
    )).scalars().all()
    for k in rows:
        try:
            if verify_password(payload.key, k.key_hash):
                return s.GatewayKeyVerifyResponse(
                    verified=True, label=k.label,
                    allowed_functions=k.allowed_functions,
                )
        except Exception:  # noqa: BLE001
            continue
    return s.GatewayKeyVerifyResponse(verified=False)


# ============================================================================
# Requests log
# ============================================================================

@router.get("/requests", response_model=list[s.RequestOut])
async def list_requests(
    admin: AdminUser, db: DbSession, limit: int = 100,
) -> list[s.RequestOut]:
    rows = (await db.execute(
        select(GwRequest).order_by(GwRequest.created_at.desc()).limit(min(limit, 500))
    )).scalars().all()

    out: list[s.RequestOut] = []
    for r in rows:
        vendor = await db.get(GwVendor, r.vendor_id) if r.vendor_id else None
        pool = await db.get(GwPool, r.pool_id) if r.pool_id else None
        pk = await db.get(GwPoolApiKey, r.pool_key_id) if r.pool_key_id else None
        out.append(s.RequestOut(
            id=r.id, gw_id=r.gw_id,
            vendor_id=r.vendor_id, vendor_name=vendor.name if vendor else None,
            pool_id=r.pool_id, pool_name=pool.name if pool else None,
            pool_key_id=r.pool_key_id, pool_key_name=pk.name if pk else None,
            function_code=r.function_code, model=r.model, status=r.status,
            error_message=r.error_message, latency_ms=r.latency_ms,
            created_at=r.created_at,
        ))
    return out


# ============================================================================
# Execute (Playground placeholder — does not yet route to vendor)
# ============================================================================

@router.post("/functions/{function_code}/execute", response_model=s.ExecuteResponse)
async def execute_function(
    function_code: str, payload: s.ExecuteRequest, admin: AdminUser, db: DbSession,
) -> s.ExecuteResponse:
    """Run a function synchronously. Picks the highest-priority active key
    from a pool that matches (function_code, optional model) and logs a
    request. Actual upstream call is stubbed — Phase 2 will plug into
    vendor SDKs. For now the response is an echo so the UX can be wired up.
    """
    fn = (await db.execute(
        select(GwApiFunction).where(GwApiFunction.code == function_code)
    )).scalar_one_or_none()
    if not fn:
        raise NotFound("function")

    pool_q = select(GwPool).where(
        GwPool.function_id == fn.id, GwPool.status == "active",
    )
    if payload.model:
        pool_q = pool_q.where(GwPool.model == payload.model)
    pool = (await db.execute(pool_q.limit(1))).scalar_one_or_none()
    pool_key = None
    if pool:
        pool_key = (await db.execute(
            select(GwPoolApiKey)
            .where(GwPoolApiKey.pool_id == pool.id, GwPoolApiKey.status == "active")
            .order_by(GwPoolApiKey.priority.desc(), GwPoolApiKey.used_count)
            .limit(1)
        )).scalar_one_or_none()

    started = time.monotonic()
    # Stub upstream call. Replace with actual SDK call in Phase 2.
    response_body = {
        "stub": True,
        "function_code": function_code,
        "model": payload.model,
        "echo_prompt": payload.prompt,
        "selected_pool": pool.name if pool else None,
        "selected_key": pool_key.name if pool_key else None,
    }
    latency = int((time.monotonic() - started) * 1000)

    gw_id = "gw_" + secrets.token_hex(8)
    req = GwRequest(
        gw_id=gw_id,
        vendor_id=pool.vendor_id if pool else None,
        pool_id=pool.id if pool else None,
        pool_key_id=pool_key.id if pool_key else None,
        function_code=function_code, model=payload.model,
        status="succeeded",
        request_body=payload.model_dump(),
        response_body=response_body,
        latency_ms=latency,
    )
    db.add(req)
    if pool_key:
        pool_key.used_count += 1
        pool_key.last_used_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()

    return s.ExecuteResponse(
        request_id=req.id, gw_id=gw_id, status="succeeded",
        pool_key_name=pool_key.name if pool_key else None,
        response=response_body, error_message=None,
    )


# ============================================================================
# Dashboard
# ============================================================================

@router.get("/dashboard", response_model=s.DashboardOut)
async def dashboard(admin: AdminUser, db: DbSession) -> s.DashboardOut:
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    cnt = lambda q: (db.execute(q).__await__().__next__() if False else None)  # placeholder for clarity

    async def c(q):
        return (await db.execute(q)).scalar() or 0

    return s.DashboardOut(
        vendors_total=await c(select(func.count()).select_from(GwVendor)),
        pools_total=await c(select(func.count()).select_from(GwPool)),
        pools_active=await c(select(func.count()).select_from(GwPool).where(GwPool.status == "active")),
        pool_keys_total=await c(select(func.count()).select_from(GwPoolApiKey)),
        pool_keys_active=await c(select(func.count()).select_from(GwPoolApiKey).where(GwPoolApiKey.status == "active")),
        functions_total=await c(select(func.count()).select_from(GwApiFunction)),
        gateway_keys_total=await c(select(func.count()).select_from(GwGatewayKey)),
        gateway_keys_active=await c(select(func.count()).select_from(GwGatewayKey).where(GwGatewayKey.status == "active")),
        requests_total=await c(select(func.count()).select_from(GwRequest)),
        requests_failed=await c(select(func.count()).select_from(GwRequest).where(GwRequest.status == "failed")),
        requests_succeeded=await c(select(func.count()).select_from(GwRequest).where(GwRequest.status == "succeeded")),
        requests_last_24h=await c(select(func.count()).select_from(GwRequest).where(GwRequest.created_at >= day_ago)),
    )
