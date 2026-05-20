"""Tool-install module.

Two routers in one manifest:

  - public: `/api/tool-installs/*` — the desktop client calls these on
    boot to announce itself. No auth required (the install_id IS the
    credential; admins gate access by setting status=active).

  - admin:  `/api/admin/auth/tool-installs/*` — super_admin manages the
    list. Placed under `/auth/` so it shows up next to /admin/domains
    in the FE nav (same "Auth → who can see what" mental model).
"""
from fastapi import APIRouter

from app.core.module_registry import ModuleManifest

from .admin_router import router as admin_router
from .public_router import router as public_router

_combined = APIRouter()
_combined.include_router(public_router)
_combined.include_router(admin_router)

manifest = ModuleManifest(
    name="tool_install",
    label="Tool Install — desktop client registry",
    router=_combined,
    tags=("tool-install",),
)
