"""GET /api/admin/stats — admin dashboard counters.

ai-gateway variant: Grok profiles + jobs do not exist. We report
users + API keys + gateway requests in their place. Schema name kept
as AdminStats for FE compat — total_profiles + total_jobs read 0
(or, optionally, GwRequest counts if the dashboard ever wires those
fields to a more honest label).
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
    domain_user_ids = (
        select(User.id).where(User.domain_id == admin.domain_id)
        if not is_super else None
    )

    def maybe_scope(q, fk_col):
        return q if is_super else q.where(fk_col.in_(domain_user_ids))

    total_users = (await db.execute(
        select(func.count(User.id)) if is_super
        else select(func.count(User.id)).where(User.domain_id == admin.domain_id)
    )).scalar_one()
    total_keys = (await db.execute(
        maybe_scope(select(func.count(ApiKey.id)), ApiKey.user_id)
    )).scalar_one()
    # In ai-gateway "jobs" == gateway requests. Reuse the FE field so the
    # admin dashboard renders without a schema change; rename later.
    total_jobs = (await db.execute(
        maybe_scope(select(func.count(GwRequest.id)), GwRequest.user_id)
    )).scalar_one()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    succ = (await db.execute(
        maybe_scope(
            select(func.count(GwRequest.id)).where(
                GwRequest.status == "success", GwRequest.created_at >= cutoff,
            ),
            GwRequest.user_id,
        )
    )).scalar_one()
    fail = (await db.execute(
        maybe_scope(
            select(func.count(GwRequest.id)).where(
                GwRequest.status == "error", GwRequest.created_at >= cutoff,
            ),
            GwRequest.user_id,
        )
    )).scalar_one()
    return AdminStats(
        total_users=total_users,
        total_api_keys=total_keys,
        total_profiles=0,
        total_jobs=total_jobs,
        jobs_24h_success=succ,
        jobs_24h_failed=fail,
    )
