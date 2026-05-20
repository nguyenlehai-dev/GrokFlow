"""User-side billing — checkout, subscription view, invoice listing."""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="billing",
    label="Billing (user)",
    router=router,
    tags=("billing",),
)
