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
