"""LLM Gateway — vendors, pools, functions, keys, request log, playground."""

from fastapi import APIRouter

from app.core.module_registry import ModuleManifest
from .router import router, legacy_router

# Combine the canonical /api/v1/gateway/* router with the legacy
# /api/v1/* alias router into one parent so the ModuleManifest's single
# `router` slot covers both surfaces. Module registry mounts this on
# the app at startup.
combined_router = APIRouter()
combined_router.include_router(router)
combined_router.include_router(legacy_router)

manifest = ModuleManifest(
    name="gateway",
    label="LLM Gateway",
    router=combined_router,
    tags=("product", "gateway",),
)
