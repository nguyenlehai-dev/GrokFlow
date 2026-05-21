"""Module marketplace — install + manage third-party plugin modules.

Exposes /api/admin/modules/* (admin-only, super_admin gate). Each module
is its own git repo following the contract in docs/MODULE-MARKETPLACE.md;
on install we clone it, build FE+BE images, spawn containers, provision
a dedicated postgres schema/user, write an nginx vhost, and record the
result in `admin_modules`. The admin sidebar renders an iframe pointing
at the module's frontend container.
"""

from fastapi import APIRouter

from app.core.module_registry import ModuleManifest
from .github_pats import router as github_pats_router
from .router import router as modules_router

# One module exposes two sibling resources under /api/admin/*:
# /api/admin/modules + /api/admin/github-pats.
router = APIRouter()
router.include_router(modules_router)
router.include_router(github_pats_router)

manifest = ModuleManifest(
    name="admin_modules",
    label="Module marketplace",
    router=router,
    tags=("admin",),
)
