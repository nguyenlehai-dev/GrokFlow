"""Per-user prompt history, synced to server (replaces localStorage)."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="prompt_history",
    label="Prompt history",
    router=router,
    tags=("user",),
)
