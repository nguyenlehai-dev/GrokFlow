"""Admin module aggregator.

Mounts the per-resource sub-routers under a single `/api/admin` prefix.
The actual endpoint code lives in `admin/routers/<resource>.py`; this
file just stitches them together.

If you need to add a new admin resource:
  1. Create `routers/<resource>.py` with `router = APIRouter()`.
  2. Add `router.include_router(<resource>.router)` here.

No URL paths changed in Phase 2 — the FE sees the same `/api/admin/*`
surface as before.
"""

from fastapi import APIRouter

from .routers import (
    entitlements,
    invoices,
    payments,
    plans,
    stats,
    subscriptions,
    system_heal,
    users,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
router.include_router(stats.router)
router.include_router(users.router)
router.include_router(entitlements.router)
router.include_router(plans.router)
router.include_router(subscriptions.router)
router.include_router(payments.router)
router.include_router(invoices.router)
router.include_router(system_heal.router)
