"""/api/v1/gateway/dashboard — KPI counters for the gateway admin UI."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.models import GwApiFunction, GwGatewayKey, GwPool, GwPoolApiKey, GwRequest, GwVendor
from app.modules.gateway import schemas as s

router = APIRouter()


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
