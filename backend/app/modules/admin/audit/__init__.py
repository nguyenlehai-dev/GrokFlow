"""Audit log — admin-visible record of mutations across the platform."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="audit",
    label="Audit log",
    router=router,
    tags=("admin",),
)
