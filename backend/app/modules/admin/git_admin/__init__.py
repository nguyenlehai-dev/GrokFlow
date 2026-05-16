"""Git / Deploy panel — repo metadata, deploy triggers, env editor."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="git_admin",
    label="Git / Deploy",
    router=router,
    tags=("admin", "super",),
)
