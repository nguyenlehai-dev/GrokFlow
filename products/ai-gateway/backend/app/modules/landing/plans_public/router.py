"""Public plans endpoint — no auth required.

Powers the landing page pricing table. Returns only active plans, ordered by
sort_order. Sensitive fields (raw entitlement JSON) are exposed because they
double as feature lists for marketing — there's nothing secret in there.
"""
import uuid
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.cache import redis_cached
from app.core.deps import DbSession
from app.models import Plan

router = APIRouter(prefix="/api/plans", tags=["plans"])


class PublicPlan(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    sort_order: int
    is_default: bool
    price_vnd: int | None
    price_usd_cents: int | None
    entitlements: dict[str, Any]

    class Config:
        from_attributes = True


@router.get("/public", response_model=list[PublicPlan])
@redis_cached(ttl=300, key="plans-public")
async def list_public_plans(db: DbSession) -> list[dict]:
    """Public plans rarely change (admin tweaks a feature once a week at
    most). 5-minute cache cuts the FE pricing page from a DB hit per visit
    to one per 5min. Admin /plans CRUD doesn't bust this — the slight
    staleness is acceptable for marketing data."""
    rows = (
        await db.execute(
            select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order)
        )
    ).scalars().all()
    # Serialize to plain dicts so the cache stores JSON, not ORM instances.
    return [PublicPlan.model_validate(p).model_dump(mode="json") for p in rows]
