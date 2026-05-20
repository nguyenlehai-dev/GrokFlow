"""Gateway response builders — DB row → Pydantic Out model."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models import GwApiFunction, GwPool, GwPoolApiKey, GwVendor
from app.modules.gateway import schemas as s


async def pool_to_out(db, pool: GwPool) -> s.PoolOut:
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


def pool_key_to_out(k: GwPoolApiKey) -> s.PoolApiKeyOut:
    return s.PoolApiKeyOut(
        id=k.id, pool_id=k.pool_id, name=k.name,
        key_prefix=(k.api_key[:6] if k.api_key else ""),
        project_id=k.project_id, priority=k.priority,
        status=k.status, last_used_at=k.last_used_at,
        used_count=k.used_count, created_at=k.created_at,
    )
