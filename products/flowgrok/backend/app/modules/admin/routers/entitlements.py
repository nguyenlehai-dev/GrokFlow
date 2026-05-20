"""/api/admin/entitlements/catalog — feature/limit key catalog for admin UI."""

from fastapi import APIRouter

from app.core.deps import AdminUser
from app.modules.admin.schemas import EntitlementCatalogOut
from app.modules.entitlements.catalog import FEATURES, LIMITS

router = APIRouter()


@router.get("/entitlements/catalog", response_model=EntitlementCatalogOut)
async def entitlement_catalog(_admin: AdminUser) -> EntitlementCatalogOut:
    """List of feature/limit keys + Vietnamese labels for the admin UI."""
    return EntitlementCatalogOut(features=FEATURES, limits=LIMITS)
