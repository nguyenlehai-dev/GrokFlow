"""Grok projects — user-scoped workspaces grouping chats / generations."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="grok_projects",
    label="Grok projects",
    router=router,
    tags=("product", "grok",),
)
