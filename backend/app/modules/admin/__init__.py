"""Admin & back-office — users, plans, billing entities, entitlements catalog.

Has both a top-level `router.py` (the legacy god-router being split in
Phase 2) and several sibling sub-modules (audit, dashboard, domains, …)
each with their own manifest.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="admin",
    label="Admin (core)",
    router=router,
    tags=("admin",),
)
