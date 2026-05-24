"""Admin & back-office — users, plans, billing entities, entitlements catalog.

Has both a top-level `router.py` (the legacy god-router being split in
Phase 2) and several sibling sub-modules (audit, dashboard, domains, …)
each with their own manifest.
"""

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.module_registry import ModuleManifest
from .router import router

# Legacy gateway.plxeditor.com served user CRUD at /api/v1/users — v2
# moved it under /api/admin/users. Re-mount the same handlers at the
# legacy prefix for customer integration compat. Same cloning trick as
# auth/__init__.py: walk APIRoutes whose path starts with /api/admin/
# and re-register the user-related ones under /api/v1.
_legacy_v1 = APIRouter(prefix="/api/v1", tags=["admin (legacy)"])
for r in router.routes:
    if not isinstance(r, APIRoute):
        continue
    # Only alias user-related endpoints — pools, vendors, etc are
    # handled by the gateway module's own legacy_router and would
    # collide if we double-mounted them.
    if not r.path.startswith("/api/admin/users"):
        continue
    tail = r.path[len("/api/admin"):]  # → /users[...]
    _legacy_v1.add_api_route(
        path=tail,
        endpoint=r.endpoint,
        response_model=r.response_model,
        status_code=r.status_code,
        tags=r.tags,
        methods=list(r.methods or []),
        name=f"legacy_{r.name}",
        operation_id=f"legacy_{r.unique_id}",
        include_in_schema=False,
    )

combined = APIRouter()
combined.include_router(router)
combined.include_router(_legacy_v1)

manifest = ModuleManifest(
    name="admin",
    label="Admin (core)",
    router=combined,
    tags=("admin",),
)
