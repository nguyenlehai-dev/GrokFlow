"""Per-tenant domains — branding, allowed_pages, status."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="domains",
    label="Domains",
    router=router,
    tags=("admin",),
)
