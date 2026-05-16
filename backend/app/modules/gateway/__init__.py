"""LLM Gateway — vendors, pools, functions, keys, request log, playground."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="gateway",
    label="LLM Gateway",
    router=router,
    tags=("product", "gateway",),
)
