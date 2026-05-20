"""Grok media gallery.

Read-only browser over `Job` rows whose status is 'success' and
result_url is set. Tenancy enforced via User.domain_id (admin) or
Job.user_id (regular user).
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="gallery",
    label="Gallery",
    router=router,
    tags=("admin",),
)
