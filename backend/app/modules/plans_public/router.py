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
async def list_public_plans(db: DbSession) -> list[Plan]:
    rows = (
        await db.execute(
            select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order)
        )
    ).scalars().all()
    return list(rows)
