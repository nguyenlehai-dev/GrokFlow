"""Sub-routers for the gateway module.

The parent `app.modules.gateway.router` aggregates these under
`/api/v1/gateway/*`. Each file owns one resource area:

    vendors        /api/v1/gateway/vendors
    functions      /api/v1/gateway/functions  (CRUD only — exec/submit live in `execute.py`)
    pools          /api/v1/gateway/pools
    pool_keys      /api/v1/gateway/pools/{pool_id}/keys + /pools/{pool_id}/models
    gateway_keys   /api/v1/gateway/gateway-keys (issued to external clients)
    requests       /api/v1/gateway/requests  + /requests/{gw_id}/status
    execute        /api/v1/gateway/functions/{code}/execute|submit
    uploads        /api/v1/gateway/uploads
    dashboard      /api/v1/gateway/dashboard

Shared helpers live in `_helpers.py`.
"""
