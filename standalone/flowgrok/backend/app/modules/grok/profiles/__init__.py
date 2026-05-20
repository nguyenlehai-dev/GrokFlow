"""Grok browser profiles — VNC-attached Chrome sessions per user."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="grok_profiles",
    label="Grok profiles",
    router=router,
    tags=("product", "grok",),
)
