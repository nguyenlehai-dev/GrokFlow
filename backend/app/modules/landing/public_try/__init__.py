"""Anonymous /try/image — rate-limited demo of the image generator."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="public_try",
    label="Public try-it",
    router=router,
    tags=("public",),
)
