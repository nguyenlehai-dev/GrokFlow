"""Servers module aggregator.

Mounts the per-resource sub-routers under `/api/admin/servers/*`.
Follows the Phase 2 pattern (see admin/router.py, gateway/router.py).
"""

from fastapi import APIRouter

from .routers import actions, backups, crud, monitoring, reboot

router = APIRouter(prefix="/api/admin", tags=["servers"])
router.include_router(crud.router)
router.include_router(actions.router)
router.include_router(backups.router)
router.include_router(monitoring.router)
router.include_router(reboot.router)
