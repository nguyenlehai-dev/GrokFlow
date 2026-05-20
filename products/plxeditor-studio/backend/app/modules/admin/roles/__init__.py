"""Role definitions per domain — entitlements, allowed pages."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="roles",
    label="Roles",
    router=router,
    tags=("admin",),
)
