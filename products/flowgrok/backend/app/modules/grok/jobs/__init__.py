"""Grok jobs — image-generation & chat tasks tracked through the worker queue."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="grok_jobs",
    label="Grok jobs",
    router=router,
    tags=("product", "grok",),
)
