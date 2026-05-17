"""Servers module aggregator.

Mounts the per-resource sub-routers under `/api/admin/servers/*`.
Follows the Phase 2 pattern (see admin/router.py, gateway/router.py).

⚠️ Route order matters: routers carrying fixed literal paths under
/servers/* (alerts, alerts-summary, reboot-history, backup-history)
MUST be included BEFORE crud.router because crud's `/{server_id}` is
a catch-all that would otherwise swallow them and fail UUID parsing.
"""

from fastapi import APIRouter

from .routers import actions, backup_jobs, backups, crud, monitoring, reboot

router = APIRouter(prefix="/api/admin", tags=["servers"])
# Specific literal paths first — these have routes like /alerts-summary,
# /reboot-history, /backup-history that would otherwise be captured by
# crud's /{server_id} catch-all.
router.include_router(monitoring.router)
router.include_router(reboot.router)
router.include_router(backup_jobs.router)
router.include_router(actions.router)
router.include_router(backups.router)
# Crud last — its /{server_id} pattern matches anything that didn't hit
# a more specific route above.
router.include_router(crud.router)
