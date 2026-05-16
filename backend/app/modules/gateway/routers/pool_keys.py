"""/api/v1/gateway/pools/{pool_id}/keys — keys belonging to a single pool."""

import uuid

from fastapi import APIRouter, status as http_status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.exceptions import NotFound
from app.models import GwPool, GwPoolApiKey
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s
from app.modules.gateway.services.serializers import pool_key_to_out

router = APIRouter()


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
    return [pool_key_to_out(k) for k in rows]


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
    return pool_key_to_out(k)


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
    return pool_key_to_out(k)


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
