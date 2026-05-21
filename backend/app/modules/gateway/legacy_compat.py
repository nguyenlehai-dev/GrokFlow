"""Legacy URL aliases for the first-gen gateway.plxeditor.com API.

The first-gen product used two flat endpoint names that the v2 reorg
renamed:

    GET  /api/v1/api-functions      -> /api/v1/gateway/functions
    GET  /api/v1/pool-api-keys      -> /api/v1/gateway/pools/{id}/keys
                                       (filtered by ?pool_id=<id>)

The other endpoints (vendors, pools, gateway-keys, functions) are exposed
verbatim via the second include_router in `router.py` — same handler, just
mounted at a second prefix.

These two need adapters because the URL **shape** changed, not just the
prefix. Customer code calling the old URLs hits these adapters; new code
should use the v2 paths directly.
"""

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import NotFound
from app.models import GwApiFunction, GwPool, GwPoolApiKey
from app.modules.gateway import schemas as s
from app.modules.gateway.services.serializers import pool_key_to_out

router = APIRouter()


@router.get("/api-functions", response_model=list[s.ApiFunctionOut])
async def list_api_functions_legacy(admin: AdminUser, db: DbSession) -> list[GwApiFunction]:
    """Alias for GET /api/v1/gateway/functions — flat name kept for v1
    callers. Returns the same rows, same shape."""
    rows = (await db.execute(select(GwApiFunction).order_by(GwApiFunction.name))).scalars().all()
    return list(rows)


@router.get("/pool-api-keys", response_model=list[s.PoolApiKeyOut])
async def list_pool_api_keys_legacy(
    admin: AdminUser, db: DbSession,
    pool_id: uuid.UUID | None = None,
    limit: int = 100,
) -> list[s.PoolApiKeyOut]:
    """Alias for GET /api/v1/gateway/pools/{pool_id}/keys with an optional
    pool_id filter — the v1 caller listed ALL keys flat across every pool
    and filtered client-side. Behaviour preserved: omit pool_id to fetch
    all keys, pass it to scope to one pool."""
    stmt = select(GwPoolApiKey)
    if pool_id is not None:
        pool = await db.get(GwPool, pool_id)
        if not pool:
            raise NotFound("pool")
        stmt = stmt.where(GwPoolApiKey.pool_id == pool_id)
    stmt = stmt.order_by(GwPoolApiKey.priority.desc(), GwPoolApiKey.name).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [pool_key_to_out(k) for k in rows]
