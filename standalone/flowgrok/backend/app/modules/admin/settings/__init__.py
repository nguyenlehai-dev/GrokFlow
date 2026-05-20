"""User-scoped settings — profile, notification preferences, password."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="settings",
    label="User settings",
    router=router,
    tags=("admin",),
)
