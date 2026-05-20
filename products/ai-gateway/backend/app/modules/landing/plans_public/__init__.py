"""Public plan listing — pricing page data, no auth required."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="plans_public",
    label="Public plans",
    router=router,
    tags=("public", "billing",),
)
