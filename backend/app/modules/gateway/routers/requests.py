"""/api/v1/gateway/requests — read-only request log.

Two endpoints:
  GET /requests          — paginated history (admin scope)
  GET /requests/{gw_id}/status — polling endpoint (public-ish, gw_id is unguessable)
"""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import NotFound
from app.core.tenant import bulk_fetch_map
from app.models import GwPool, GwPoolApiKey, GwRequest, GwVendor
from app.modules.gateway import schemas as s

router = APIRouter()


@router.get("/requests", response_model=list[s.RequestOut])
async def list_requests(
    admin: AdminUser, db: DbSession, limit: int = 100,
) -> list[s.RequestOut]:
    q = select(GwRequest).order_by(GwRequest.created_at.desc()).limit(min(limit, 500))
    if admin.role != "super_admin":
        q = q.where(GwRequest.domain_id == admin.domain_id)
    rows = list((await db.execute(q)).scalars().all())

    # Batch-fetch vendor/pool/pool-key by id so the response doesn't issue
    # 3 extra SELECTs per row (was N+1 — limit=500 meant up to 1500 queries).
    # bulk_fetch_map lives in app.core.tenant.
    vendors = await bulk_fetch_map(db, GwVendor, {r.vendor_id for r in rows if r.vendor_id})
    pools = await bulk_fetch_map(db, GwPool, {r.pool_id for r in rows if r.pool_id})
    pool_keys = await bulk_fetch_map(db, GwPoolApiKey, {r.pool_key_id for r in rows if r.pool_key_id})

    return [
        s.RequestOut(
            id=r.id, gw_id=r.gw_id,
            vendor_id=r.vendor_id,
            vendor_name=vendors[r.vendor_id].name if r.vendor_id in vendors else None,
            pool_id=r.pool_id,
            pool_name=pools[r.pool_id].name if r.pool_id in pools else None,
            pool_key_id=r.pool_key_id,
            pool_key_name=pool_keys[r.pool_key_id].name if r.pool_key_id in pool_keys else None,
            function_code=r.function_code, model=r.model, status=r.status,
            error_message=r.error_message, latency_ms=r.latency_ms,
            tokens_input=r.tokens_input, tokens_output=r.tokens_output,
            cost_cents=r.cost_cents,
            request_body=r.request_body, response_body=r.response_body,
            created_at=r.created_at,
        )
        for r in rows
    ]


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
