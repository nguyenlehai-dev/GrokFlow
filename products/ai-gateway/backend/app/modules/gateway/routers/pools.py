"""/api/v1/gateway/pools — pool CRUD + `/pools/{id}/models` helper.

Pools group a vendor + function + model + N API keys for the runtime
router to pick from. The `/models` helper queries the vendor directly to
list available models (saves admin from copy-pasting from vendor dashboards).
"""

import uuid

import httpx
from fastapi import APIRouter, status as http_status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.core.http_client import get_http
from app.models import GwPool, GwPoolApiKey, GwVendor, GwApiFunction
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s
from app.modules.gateway.services.serializers import pool_to_out

router = APIRouter()


@router.get("/pools", response_model=list[s.PoolOut])
async def list_pools(admin: AdminUser, db: DbSession) -> list[s.PoolOut]:
    rows = (await db.execute(select(GwPool).order_by(GwPool.name))).scalars().all()
    return [await pool_to_out(db, p) for p in rows]


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
    return await pool_to_out(db, p)


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
    return await pool_to_out(db, p)


@router.delete("/pools/{pool_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_pool(pool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
    p = await db.get(GwPool, pool_id)
    if not p:
        raise NotFound("pool")
    await db.delete(p)
    await db.commit()


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

    cli = get_http()
    list_timeout = 20.0
    try:
        if vendor.code in ("google", "gemini"):
            r = await cli.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": key.api_key, "pageSize": 200},
                timeout=list_timeout,
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
            r = await cli.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key.api_key}"},
                timeout=list_timeout,
            )
            r.raise_for_status()
            models = [{"id": m["id"]} for m in r.json().get("data", [])]
            return {"vendor": "openai", "models": models}

        if vendor.code in ("anthropic", "claude"):
            r = await cli.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key.api_key, "anthropic-version": "2023-06-01"},
                timeout=list_timeout,
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
