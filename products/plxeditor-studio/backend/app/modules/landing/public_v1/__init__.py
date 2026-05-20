"""Public v1 API — domain config, landing-page content."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="public_v1",
    label="Public v1 API",
    router=router,
    tags=("public",),
)
