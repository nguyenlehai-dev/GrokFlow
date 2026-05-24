"""GET /api/admin/stats — admin dashboard counters.

ai-gateway override: monorepo version reads Job + Profile (Grok) which
don't exist here. We count Users + API keys + gateway requests. Schema
name kept as AdminStats for FE compat; total_profiles always 0.

GwRequest scopes by `domain_id` (not user_id — gateway is per-tenant,
not per-user).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.models import ApiKey, GwRequest, User
from app.modules.admin.schemas import AdminStats

router = APIRouter()


@router.get("/stats", response_model=AdminStats)
async def stats(admin: AdminUser, db: DbSession) -> AdminStats:
    is_super = admin.role == "super_admin"
    dom_id = None if is_super else admin.domain_id

    total_users_q = select(func.count(User.id))
    if dom_id is not None:
        total_users_q = total_users_q.where(User.domain_id == dom_id)
    total_users = (await db.execute(total_users_q)).scalar_one() or 0

    total_keys_q = select(func.count(ApiKey.id))
    if dom_id is not None:
        total_keys_q = total_keys_q.where(
            ApiKey.user_id.in_(select(User.id).where(User.domain_id == dom_id))
        )
    total_keys = (await db.execute(total_keys_q)).scalar_one() or 0

    base_gw = select(func.count(GwRequest.id))
    if dom_id is not None:
        base_gw = base_gw.where(GwRequest.domain_id == dom_id)
    total_jobs = (await db.execute(base_gw)).scalar_one() or 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    succ_q = select(func.count(GwRequest.id)).where(
        GwRequest.status == "success", GwRequest.created_at >= cutoff,
    )
    if dom_id is not None:
        succ_q = succ_q.where(GwRequest.domain_id == dom_id)
    succ = (await db.execute(succ_q)).scalar_one() or 0

    fail_q = select(func.count(GwRequest.id)).where(
        GwRequest.status == "error", GwRequest.created_at >= cutoff,
    )
    if dom_id is not None:
        fail_q = fail_q.where(GwRequest.domain_id == dom_id)
    fail = (await db.execute(fail_q)).scalar_one() or 0

    return AdminStats(
        total_users=total_users,
        total_api_keys=total_keys,
        total_profiles=0,
        total_jobs=total_jobs,
        jobs_24h_success=succ,
        jobs_24h_failed=fail,
    )
