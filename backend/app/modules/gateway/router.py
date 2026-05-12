"""LLM Gateway management — vendors / pools / functions / requests / keys.

Layout inspired by gateway.plxeditor.com — admin manages an inventory of
upstream LLM vendors, creates pools of API keys per (vendor, function,
model), and issues gateway keys to external clients. The /execute and
/submit endpoints are placeholders for now — actual vendor routing logic
lives in services/gateway_router.py (Phase 2).
"""
from __future__ import annotations

import asyncio
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, UploadFile, status as http_status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.core.database import SessionLocal

from app.core.deps import AdminUser, SuperAdminUser, CurrentUser, DbSession
from app.core.exceptions import AppError, InvalidPayload, NotFound
from app.core.security import hash_password, verify_password
from app.models import (
    GwApiFunction, GwGatewayKey, GwPool, GwPoolApiKey, GwRequest, GwVendor,
)
from app.modules.audit import service as audit

from . import schemas as s
from .auth import GatewayCaller, require_caller
from .providers import (
    ProviderAuthError, ProviderError, ProviderQuotaExhausted, get_provider,
)

router = APIRouter(prefix="/api/v1/gateway", tags=["gateway"])


# ============================================================================
# Vendors
# ============================================================================

@router.get("/vendors", response_model=list[s.VendorOut])
async def list_vendors(admin: SuperAdminUser, db: DbSession) -> list[GwVendor]:
    rows = (await db.execute(select(GwVendor).order_by(GwVendor.name))).scalars().all()
    return list(rows)


@router.post("/vendors", response_model=s.VendorOut, status_code=http_status.HTTP_201_CREATED)
async def create_vendor(payload: s.VendorIn, admin: SuperAdminUser, db: DbSession) -> GwVendor:
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
    vendor_id: uuid.UUID, payload: s.VendorUpdate, admin: SuperAdminUser, db: DbSession,
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
async def delete_vendor(vendor_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
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
async def list_functions(admin: SuperAdminUser, db: DbSession) -> list[GwApiFunction]:
    rows = (await db.execute(select(GwApiFunction).order_by(GwApiFunction.name))).scalars().all()
    return list(rows)


@router.post("/functions", response_model=s.ApiFunctionOut, status_code=http_status.HTTP_201_CREATED)
async def create_function(payload: s.ApiFunctionIn, admin: SuperAdminUser, db: DbSession) -> GwApiFunction:
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
    function_id: uuid.UUID, payload: s.ApiFunctionUpdate, admin: SuperAdminUser, db: DbSession,
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
async def delete_function(function_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
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
        cooldown_seconds=pool.cooldown_seconds,
        keys_total=keys_total,
        keys_active=keys_active,
        created_at=pool.created_at,
    )


@router.get("/pools", response_model=list[s.PoolOut])
async def list_pools(admin: SuperAdminUser, db: DbSession) -> list[s.PoolOut]:
    rows = (await db.execute(select(GwPool).order_by(GwPool.name))).scalars().all()
    return [await _pool_to_out(db, p) for p in rows]


@router.post("/pools", response_model=s.PoolOut, status_code=http_status.HTTP_201_CREATED)
async def create_pool(payload: s.PoolIn, admin: SuperAdminUser, db: DbSession) -> s.PoolOut:
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
    pool_id: uuid.UUID, payload: s.PoolUpdate, admin: SuperAdminUser, db: DbSession,
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
async def delete_pool(pool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
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


@router.get("/pools/{pool_id}/models")
async def list_vendor_models(
    pool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
) -> dict:
    """Helper: lookup the first active key in this pool and ask the vendor
    which models are currently available. Saves admin from copy-pasting
    model ids out of vendor dashboards.
    """
    pool = await db.get(GwPool, pool_id)
    if not pool:
        raise NotFound("pool")
    vendor = await db.get(GwVendor, pool.vendor_id)
    if not vendor:
        raise NotFound("vendor")

    key = (await db.execute(
        select(GwPoolApiKey)
        .where(GwPoolApiKey.pool_id == pool_id, GwPoolApiKey.status == "active")
        .limit(1)
    )).scalar_one_or_none()
    if not key:
        raise InvalidPayload("Pool chưa có active API key để query vendor")

    try:
        if vendor.code in ("google", "gemini"):
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": key.api_key, "pageSize": 200},
                )
                r.raise_for_status()
                data = r.json()
                models = []
                for m in data.get("models", []):
                    name = (m.get("name") or "").replace("models/", "")
                    methods = m.get("supportedGenerationMethods") or []
                    if name and "generateContent" in methods:
                        models.append({
                            "id": name,
                            "display_name": m.get("displayName"),
                            "description": (m.get("description") or "")[:200],
                        })
                return {"vendor": "google", "models": models}

        if vendor.code in ("openai", "oai"):
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {key.api_key}"},
                )
                r.raise_for_status()
                models = [{"id": m["id"]} for m in r.json().get("data", [])]
                return {"vendor": "openai", "models": models}

        if vendor.code in ("anthropic", "claude"):
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": key.api_key, "anthropic-version": "2023-06-01"},
                )
                r.raise_for_status()
                models = [{"id": m["id"], "display_name": m.get("display_name")}
                          for m in r.json().get("data", [])]
                return {"vendor": "anthropic", "models": models}

        return {"vendor": vendor.code, "models": [], "note": "Vendor không hỗ trợ list models tự động"}
    except httpx.HTTPStatusError as e:
        raise InvalidPayload(f"Vendor trả lỗi: HTTP {e.response.status_code} — {e.response.text[:200]}")
    except Exception as e:
        raise InvalidPayload(f"List models lỗi: {e}")


@router.get("/pools/{pool_id}/keys", response_model=list[s.PoolApiKeyOut])
async def list_pool_keys(
    pool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
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
    pool_id: uuid.UUID, payload: s.PoolApiKeyIn, admin: SuperAdminUser, db: DbSession,
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
    admin: SuperAdminUser, db: DbSession,
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
    pool_id: uuid.UUID, key_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
):
    k = await db.get(GwPoolApiKey, key_id)
    if not k or k.pool_id != pool_id:
        raise NotFound("pool_key")
    await db.delete(k)
    await db.commit()


# ============================================================================
# Gateway Keys (issued to external clients)
# ============================================================================

def _scope_keys_query(q, admin):
    """Scope a GwGatewayKey query to the admin's domain (super sees all).

    Also surfaces legacy NULL-domain keys to super_admin only — a domain admin
    can't see (or steal) keys that weren't tagged with a tenant.
    """
    if admin.role == "super_admin":
        return q
    return q.where(GwGatewayKey.domain_id == admin.domain_id)


@router.get("/gateway-keys", response_model=list[s.GatewayKeyOut])
async def list_gateway_keys(admin: AdminUser, db: DbSession) -> list[GwGatewayKey]:
    q = _scope_keys_query(
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
        created_at=k.created_at, plain_key=raw,
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
    q = select(GwRequest).order_by(GwRequest.created_at.desc()).limit(min(limit, 500))
    if admin.role != "super_admin":
        q = q.where(GwRequest.domain_id == admin.domain_id)
    rows = (await db.execute(q)).scalars().all()

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
            tokens_input=r.tokens_input, tokens_output=r.tokens_output,
            cost_cents=r.cost_cents,
            created_at=r.created_at,
        ))
    return out


# ============================================================================
# Execute (Playground placeholder — does not yet route to vendor)
# ============================================================================

QUOTA_COOLDOWN_DEFAULT = 300  # fallback if a pool has no cooldown_seconds (legacy rows)


class GatewayRateLimitExceeded(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(429, "rate_limited", message)


class GatewayQuotaExceeded(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(429, "daily_quota_exceeded", message)


async def _enforce_gateway_key_quota(
    db, caller: "GatewayCaller",
) -> GwGatewayKey | None:
    """Throttle the calling gateway key.

    Two checks, in order: (1) requests in the last 60s vs rate_limit_per_minute,
    (2) used_today vs daily_quota (0 = unlimited). Admin callers skip both.
    Returns the GwGatewayKey for the caller (so caller can update used_today
    after a successful call), or None when caller is admin.
    """
    if caller.kind != "gateway_key" or not caller.gateway_key_id:
        return None

    gk = await db.get(GwGatewayKey, caller.gateway_key_id)
    if not gk:
        return None

    # Daily quota
    if gk.daily_quota and gk.used_today >= gk.daily_quota:
        raise GatewayQuotaExceeded(
            f"Đã dùng hết daily quota ({gk.daily_quota}). Reset vào UTC midnight."
        )

    # Per-minute rate limit
    one_min_ago = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent = (await db.execute(
        select(func.count()).select_from(GwRequest)
        .where(
            GwRequest.gateway_key_id == gk.id,
            GwRequest.created_at >= one_min_ago,
        )
    )).scalar() or 0
    if gk.rate_limit_per_minute and recent >= gk.rate_limit_per_minute:
        raise GatewayRateLimitExceeded(
            f"Rate limit {gk.rate_limit_per_minute}/phút bị vượt — chờ vài giây."
        )

    return gk

# Where multipart uploads land. Same volume as the rest of the app storage
# so /api/v1/gateway/uploads/{filename} can serve them straight back.
UPLOAD_DIR = Path(os.environ.get("LOCAL_STORAGE_PATH", "/app/storage")) / "gateway-uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _resolve_pool(
    db, function_code: str, model: str | None,
) -> tuple[GwApiFunction, GwPool, GwVendor, list[GwPoolApiKey]]:
    """Look up function, pool, vendor, and pickable candidate keys.

    A key is "pickable" when status='active' AND
    (cooldown_until IS NULL OR cooldown_until < now).
    """
    fn = (await db.execute(
        select(GwApiFunction).where(GwApiFunction.code == function_code)
    )).scalar_one_or_none()
    if not fn:
        raise NotFound("function")

    pool_q = select(GwPool).where(
        GwPool.function_id == fn.id, GwPool.status == "active",
    )
    if model:
        pool_q = pool_q.where(GwPool.model == model)
    pool = (await db.execute(pool_q.limit(1))).scalar_one_or_none()
    if not pool:
        raise InvalidPayload(
            f"Chưa có pool active nào cho function '{function_code}'"
            + (f" + model '{model}'" if model else "")
        )

    vendor = await db.get(GwVendor, pool.vendor_id)
    if not vendor:
        raise InvalidPayload("Vendor không tồn tại")

    now = datetime.now(timezone.utc)
    candidates: list[GwPoolApiKey] = list((await db.execute(
        select(GwPoolApiKey)
        .where(
            GwPoolApiKey.pool_id == pool.id,
            GwPoolApiKey.status == "active",
            or_(
                GwPoolApiKey.cooldown_until.is_(None),
                GwPoolApiKey.cooldown_until < now,
            ),
        )
        .order_by(GwPoolApiKey.priority.desc(), GwPoolApiKey.used_count)
    )).scalars().all())

    if not candidates:
        raise InvalidPayload(
            f"Pool '{pool.name}' không có API key khả dụng (hết cooldown / inactive)"
        )

    return fn, pool, vendor, candidates


async def _do_execute(
    db, gw_id: str, pool: GwPool, vendor: GwVendor,
    candidates: list[GwPoolApiKey], function_code: str,
    payload: s.ExecuteRequest, gateway_key_id: uuid.UUID | None,
) -> GwRequest:
    """Shared core: run through candidate keys, persist GwRequest row.

    Pre-condition: caller has inserted a 'pending' GwRequest with `gw_id`.
    This function updates it in place + commits.
    """
    provider = get_provider(vendor.code)
    if provider is None:
        # Find the pending row and mark failed
        req = (await db.execute(
            select(GwRequest).where(GwRequest.gw_id == gw_id)
        )).scalar_one()
        req.status = "failed"
        req.error_message = f"Vendor '{vendor.code}' chưa có provider implementation"
        await db.commit()
        return req

    started = time.monotonic()
    last_err: str | None = None
    used_key: GwPoolApiKey | None = None
    normalized: dict | None = None
    final_status = "failed"
    model = payload.model or pool.model or ""

    for key in candidates:
        try:
            normalized = await provider.execute(
                model=model,
                prompt=payload.prompt,
                reference_image_urls=payload.reference_image_urls,
                reference_video_urls=payload.reference_video_urls,
                aspect_ratio=payload.aspect_ratio,
                image_size=payload.image_size,
                extra=payload.raw,
                api_key=key.api_key,
                project_id=key.project_id,
            )
            used_key = key
            final_status = "succeeded"
            break
        except ProviderQuotaExhausted as e:
            last_err = f"[quota] {e}"
            cd_secs = pool.cooldown_seconds or QUOTA_COOLDOWN_DEFAULT
            key.cooldown_until = datetime.now(timezone.utc) + timedelta(seconds=cd_secs)
            key.last_used_at = datetime.now(timezone.utc)
            await db.flush()
            continue
        except ProviderAuthError as e:
            last_err = f"[auth] {e}"
            key.status = "inactive"
            await db.flush()
            continue
        except ProviderError as e:
            last_err = str(e)
            used_key = key
            break
        except Exception as e:  # noqa: BLE001 — provider should subclass ProviderError, but be safe
            last_err = f"unexpected: {e}"
            used_key = key
            break

    latency = int((time.monotonic() - started) * 1000)
    if used_key and final_status == "succeeded":
        used_key.used_count += 1
        used_key.last_used_at = datetime.now(timezone.utc)

    # Cost / token usage — pulled out of the normalized provider response
    # and combined with pool pricing (cents per million tokens).
    tokens_in = (normalized or {}).get("tokens_input")
    tokens_out = (normalized or {}).get("tokens_output")
    cost_cents: int | None = None
    if final_status == "succeeded" and (tokens_in or tokens_out):
        ci = pool.cost_per_million_input_cents or 0
        co = pool.cost_per_million_output_cents or 0
        if ci or co:
            cost_cents = int(
                ((tokens_in or 0) * ci + (tokens_out or 0) * co) / 1_000_000
            )

    req = (await db.execute(
        select(GwRequest).where(GwRequest.gw_id == gw_id)
    )).scalar_one()
    req.status = final_status
    req.pool_key_id = used_key.id if used_key else None
    req.model = model
    req.response_body = normalized
    req.error_message = last_err
    req.latency_ms = latency
    req.tokens_input = tokens_in
    req.tokens_output = tokens_out
    req.cost_cents = cost_cents

    # Bump gateway key's used_today after success (cheap concurrent-safe-enough
    # increment — slight overcount in races is acceptable for billing).
    if final_status == "succeeded" and req.gateway_key_id:
        gk = await db.get(GwGatewayKey, req.gateway_key_id)
        if gk:
            gk.used_today += 1

    await db.commit()
    return req


@router.post("/functions/{function_code}/execute", response_model=s.ExecuteResponse)
async def execute_function(
    function_code: str, payload: s.ExecuteRequest, db: DbSession,
    caller: GatewayCaller = Depends(require_caller),
) -> s.ExecuteResponse:
    """Run a function synchronously.

    Caller is either an admin JWT (for the Playground) or a gateway key
    (`gwk_live_…`) for external clients. Picks the highest-priority active
    key from a matching pool that isn't on cooldown, calls the vendor
    provider, and on 429 puts the key on a 5-min cooldown + tries next.
    """
    if not caller.can_call_function(function_code):
        raise InvalidPayload(
            f"Gateway key này không có quyền gọi function '{function_code}'"
        )
    await _enforce_gateway_key_quota(db, caller)

    fn, pool, vendor, candidates = await _resolve_pool(
        db, function_code, payload.model,
    )

    gw_id = "gw_" + secrets.token_hex(8)
    req = GwRequest(
        gw_id=gw_id, gateway_key_id=caller.gateway_key_id,
        domain_id=caller.domain_id,
        vendor_id=pool.vendor_id, pool_id=pool.id,
        function_code=function_code,
        request_body=payload.model_dump(),
        status="pending",
    )
    db.add(req)
    await db.flush()

    req = await _do_execute(
        db, gw_id, pool, vendor, candidates, function_code, payload,
        caller.gateway_key_id,
    )

    used_key = await db.get(GwPoolApiKey, req.pool_key_id) if req.pool_key_id else None
    return s.ExecuteResponse(
        request_id=req.id, gw_id=gw_id, status=req.status,
        pool_key_name=used_key.name if used_key else None,
        response=req.response_body,
        error_message=req.error_message if req.status == "failed" else None,
    )


@router.post("/functions/{function_code}/submit", response_model=s.ExecuteResponse)
async def submit_function(
    function_code: str, payload: s.ExecuteRequest, db: DbSession,
    caller: GatewayCaller = Depends(require_caller),
) -> s.ExecuteResponse:
    """Async variant of /execute — returns immediately with status=pending.

    The provider call fires off in a background task; the caller polls
    GET /requests/{gw_id}/status until status moves to succeeded / failed.
    Useful for video gen where upstream calls take 30+ seconds.
    """
    if not caller.can_call_function(function_code):
        raise InvalidPayload(
            f"Gateway key này không có quyền gọi function '{function_code}'"
        )
    await _enforce_gateway_key_quota(db, caller)

    fn, pool, vendor, candidates = await _resolve_pool(
        db, function_code, payload.model,
    )

    gw_id = "gw_" + secrets.token_hex(8)
    req = GwRequest(
        gw_id=gw_id, gateway_key_id=caller.gateway_key_id,
        domain_id=caller.domain_id,
        vendor_id=pool.vendor_id, pool_id=pool.id,
        function_code=function_code, model=payload.model or pool.model,
        request_body=payload.model_dump(),
        status="pending",
    )
    db.add(req)
    await db.flush()
    await db.commit()

    # Snapshot the IDs — candidate ORM objects can't cross session boundary
    candidate_ids = [k.id for k in candidates]
    pool_id, vendor_id = pool.id, vendor.id
    gateway_key_id = caller.gateway_key_id

    async def _runner() -> None:
        async with SessionLocal() as bg_db:
            bg_pool = await bg_db.get(GwPool, pool_id)
            bg_vendor = await bg_db.get(GwVendor, vendor_id)
            bg_candidates = [await bg_db.get(GwPoolApiKey, cid) for cid in candidate_ids]
            bg_candidates = [c for c in bg_candidates if c is not None]
            try:
                await _do_execute(
                    bg_db, gw_id, bg_pool, bg_vendor, bg_candidates,
                    function_code, payload, gateway_key_id,
                )
            except Exception as e:  # noqa: BLE001 — last-resort logging
                try:
                    r = (await bg_db.execute(
                        select(GwRequest).where(GwRequest.gw_id == gw_id)
                    )).scalar_one_or_none()
                    if r:
                        r.status = "failed"
                        r.error_message = f"background runner crash: {e}"
                        await bg_db.commit()
                except Exception:  # noqa: BLE001
                    pass
            # Webhook delivery — fire only after the row has settled.
            if gateway_key_id:
                gk = await bg_db.get(GwGatewayKey, gateway_key_id)
                if gk and gk.webhook_url:
                    r = (await bg_db.execute(
                        select(GwRequest).where(GwRequest.gw_id == gw_id)
                    )).scalar_one_or_none()
                    if r:
                        try:
                            async with httpx.AsyncClient(timeout=10) as cli:
                                await cli.post(gk.webhook_url, json={
                                    "gw_id": r.gw_id,
                                    "status": r.status,
                                    "function_code": r.function_code,
                                    "model": r.model,
                                    "error_message": r.error_message,
                                    "latency_ms": r.latency_ms,
                                })
                        except Exception:  # noqa: BLE001 — webhook is best-effort
                            pass

    asyncio.create_task(_runner())

    return s.ExecuteResponse(
        request_id=req.id, gw_id=gw_id, status="pending",
        pool_key_name=None, response=None, error_message=None,
    )


# ============================================================================
# File uploads — multipart reference images for Playground / clients
# ============================================================================

ALLOWED_UPLOAD_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB


@router.post("/uploads")
async def upload_reference(
    db: DbSession,
    file: UploadFile = File(...),
    caller: GatewayCaller = Depends(require_caller),
):
    """Accept a multipart file, store under storage/gateway-uploads, return
    a stable URL the playground (or client) can paste into reference_*_urls.
    """
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    if ext and ext not in ALLOWED_UPLOAD_EXTS:
        raise InvalidPayload(f"Extension {ext} không được phép. Cho phép: {sorted(ALLOWED_UPLOAD_EXTS)}")

    file_id = secrets.token_urlsafe(16).replace("-", "").replace("_", "")[:24]
    safe_name = f"{file_id}{ext}"
    path = UPLOAD_DIR / safe_name

    total = 0
    with path.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 64)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                f.close()
                path.unlink(missing_ok=True)
                raise InvalidPayload(f"File quá lớn (>{MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
            f.write(chunk)

    return {
        "filename": safe_name,
        "size": total,
        "url": f"/api/v1/gateway/uploads/{safe_name}",
    }


@router.get("/uploads/{filename}", response_model=None)
async def serve_upload(filename: str):
    """Serve a previously-uploaded reference back. Public — uploads have
    unguessable filenames already.
    """
    # Defence in depth — refuse anything with path separators.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise NotFound("file")
    path = UPLOAD_DIR / filename
    if not path.exists() or not path.is_file():
        raise NotFound("file")
    return FileResponse(path)


@router.get("/requests/{gw_id}/status", response_model=s.RequestOut)
async def request_status(gw_id: str, db: DbSession) -> s.RequestOut:
    """Polling endpoint — public-ish, takes the gw_id as a lookup key.
    Caller doesn't need auth because the gw_id is itself unguessable (random
    16-byte token); same pattern Stripe / OpenAI use for their request ids.
    """
    r = (await db.execute(
        select(GwRequest).where(GwRequest.gw_id == gw_id)
    )).scalar_one_or_none()
    if not r:
        raise NotFound("request")
    vendor = await db.get(GwVendor, r.vendor_id) if r.vendor_id else None
    pool = await db.get(GwPool, r.pool_id) if r.pool_id else None
    pk = await db.get(GwPoolApiKey, r.pool_key_id) if r.pool_key_id else None
    return s.RequestOut(
        id=r.id, gw_id=r.gw_id,
        vendor_id=r.vendor_id, vendor_name=vendor.name if vendor else None,
        pool_id=r.pool_id, pool_name=pool.name if pool else None,
        pool_key_id=r.pool_key_id, pool_key_name=pk.name if pk else None,
        function_code=r.function_code, model=r.model, status=r.status,
        error_message=r.error_message, latency_ms=r.latency_ms,
        tokens_input=r.tokens_input, tokens_output=r.tokens_output,
        cost_cents=r.cost_cents,
        created_at=r.created_at,
    )


# ============================================================================
# Dashboard
# ============================================================================

@router.get("/dashboard", response_model=s.DashboardOut)
async def dashboard(admin: AdminUser, db: DbSession) -> s.DashboardOut:
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)

    async def c(q):
        return (await db.execute(q)).scalar() or 0

    # Per-tenant scope for domain admins. Vendors/Pools/Functions are global
    # (super_admin manages them) so we leave them unfiltered — domain admins
    # see the same global config but tenant-scoped counts for keys+requests.
    is_super = admin.role == "super_admin"

    def _keys_q(base):
        return base if is_super else base.where(GwGatewayKey.domain_id == admin.domain_id)

    def _req_q(base):
        return base if is_super else base.where(GwRequest.domain_id == admin.domain_id)

    return s.DashboardOut(
        vendors_total=await c(select(func.count()).select_from(GwVendor)),
        pools_total=await c(select(func.count()).select_from(GwPool)),
        pools_active=await c(select(func.count()).select_from(GwPool).where(GwPool.status == "active")),
        pool_keys_total=await c(select(func.count()).select_from(GwPoolApiKey)),
        pool_keys_active=await c(select(func.count()).select_from(GwPoolApiKey).where(GwPoolApiKey.status == "active")),
        functions_total=await c(select(func.count()).select_from(GwApiFunction)),
        gateway_keys_total=await c(_keys_q(select(func.count()).select_from(GwGatewayKey))),
        gateway_keys_active=await c(_keys_q(select(func.count()).select_from(GwGatewayKey).where(GwGatewayKey.status == "active"))),
        requests_total=await c(_req_q(select(func.count()).select_from(GwRequest))),
        requests_failed=await c(_req_q(select(func.count()).select_from(GwRequest).where(GwRequest.status == "failed"))),
        requests_succeeded=await c(_req_q(select(func.count()).select_from(GwRequest).where(GwRequest.status == "succeeded"))),
        requests_last_24h=await c(_req_q(select(func.count()).select_from(GwRequest).where(GwRequest.created_at >= day_ago))),
    )
