"""Admin dashboard — system-wide and per-tenant KPIs."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="dashboard",
    label="Admin dashboard",
    router=router,
    tags=("admin",),
)
