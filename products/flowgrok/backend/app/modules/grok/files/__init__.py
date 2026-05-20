"""Grok file uploads — image inputs for chat / playground."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="grok_files",
    label="Grok files",
    router=router,
    tags=("product", "grok",),
)
