"""Gateway module aggregator.

Mounts the per-resource sub-routers under `/api/v1/gateway/*`. Endpoint
code lives in `gateway/routers/<resource>.py`; this file just stitches.

Resources (load order matters for OpenAPI tag ordering):
  vendors          /vendors
  functions        /functions
  pools            /pools                          (+ /pools/{id}/models)
  pool_keys        /pools/{id}/keys
  gateway_keys     /gateway-keys                   (+ /gateway-keys/verify)
  requests         /requests, /requests/{gw_id}/status
  execute          /functions/{code}/execute|submit
  uploads          /uploads
  dashboard        /dashboard

Phase 2 of the BE reorg: URL paths unchanged, surface area unchanged —
only internal organization shifted.
"""

from fastapi import APIRouter

from .routers import (
    dashboard,
    execute,
    functions,
    gateway_keys,
    pool_keys,
    pools,
    requests,
    uploads,
    vendors,
)

router = APIRouter(prefix="/api/v1/gateway", tags=["gateway"])
router.include_router(vendors.router)
router.include_router(functions.router)
router.include_router(pools.router)
router.include_router(pool_keys.router)
router.include_router(gateway_keys.router)
router.include_router(requests.router)
router.include_router(execute.router)
router.include_router(uploads.router)
router.include_router(dashboard.router)


# ---------------------------------------------------------------------------
# Legacy compat — flat /api/v1/* paths
# ---------------------------------------------------------------------------
# The first-generation gateway product (gateway.plxeditor.com) shipped CRUD
# endpoints at /api/v1/<resource> with no /gateway/ infix:
#
#     /api/v1/vendors
#     /api/v1/pools
#     /api/v1/pool-api-keys
#     /api/v1/gateway-keys
#     /api/v1/api-functions
#
# V2 reorganised everything under /api/v1/gateway/<resource> so the gateway
# module is namespaced cleanly. To let customer code that targeted the
# legacy URLs keep working without a code change, we re-mount the same
# sub-routers at the legacy prefix. The function-execute and request-list
# endpoints (/api/v1/gateway/functions/.../execute, /api/v1/gateway/requests)
# already live at identical paths on both — no alias needed.
#
# The two name renames (pool-api-keys, api-functions) need their own thin
# adapter routers — see legacy_compat.py.
legacy_router = APIRouter(prefix="/api/v1", tags=["gateway (legacy)"])
legacy_router.include_router(vendors.router)
legacy_router.include_router(pools.router)
legacy_router.include_router(pool_keys.router)
legacy_router.include_router(gateway_keys.router)
legacy_router.include_router(functions.router)
# Renamed endpoints — adapters in legacy_compat keep the old URL working.
from . import legacy_compat  # noqa: E402
legacy_router.include_router(legacy_compat.router)
