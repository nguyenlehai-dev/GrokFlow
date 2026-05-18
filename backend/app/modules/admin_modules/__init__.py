"""Module marketplace — install + manage third-party plugin modules.

Exposes /api/admin/modules/* (admin-only, super_admin gate). Each module
is its own git repo following the contract in docs/MODULE-MARKETPLACE.md;
on install we clone it, build FE+BE images, spawn containers, provision
a dedicated postgres schema/user, write an nginx vhost, and record the
result in `admin_modules`. The admin sidebar renders an iframe pointing
at the module's frontend container.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="admin_modules",
    label="Module marketplace",
    router=router,
    tags=("admin",),
)
