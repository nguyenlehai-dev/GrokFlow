"""Auth surface — login, refresh, /me, registration."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="auth",
    label="Auth",
    router=router,
    tags=("public", "auth"),
)
