"""User-issued API keys (gwk_live_*) — for programmatic access."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="api_keys",
    label="API Keys",
    router=router,
    tags=("auth",),
)
