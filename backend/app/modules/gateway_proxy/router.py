"""SSO proxy to gatewaygrok-backend.

Admin logs into GrokFlow once. When the frontend hits /api/gateway-proxy/*,
this router:
  1. validates the GrokFlow JWT (admin role required),
  2. lazily logs into gatewaygrok with the configured admin creds and
     caches the token in-process,
  3. forwards the request, adding the gateway Bearer header.

The cached token is refreshed when it 401s. No DB persistence — process
restart re-logs in.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core.deps import AdminUser
from app.core.exceptions import AppError

router = APIRouter(prefix="/api/gateway-proxy", tags=["gateway-proxy"])


GATEWAY_BASE_URL = os.environ.get("GATEWAY_BACKEND_URL", "http://host.docker.internal:8001")
GATEWAY_USERNAME = os.environ.get("GATEWAY_ADMIN_USERNAME", "admin")
GATEWAY_PASSWORD = os.environ.get("GATEWAY_ADMIN_PASSWORD", "")


class GatewayConfigError(AppError):
    def __init__(self, msg: str) -> None:
        super().__init__(500, "gateway_not_configured", msg)


class _TokenCache:
    """In-process cache for the gatewaygrok admin token.

    Re-login happens lazily: on first use, and after a 401 response.
    Concurrent requests racing the first login is fine — both will hit
    login() once each but only the last cached value sticks. Avoids the
    locking overhead for what should be a once-per-process operation.
    """

    def __init__(self) -> None:
        self.token: str | None = None
        self.expires_at: float = 0.0

    def is_valid(self) -> bool:
        return self.token is not None and time.time() < self.expires_at - 60

    async def refresh(self) -> str:
        if not GATEWAY_PASSWORD:
            raise GatewayConfigError(
                "GATEWAY_ADMIN_PASSWORD chưa được set trong .env.prod — "
                "không thể proxy tới gatewaygrok-backend."
            )
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(
                f"{GATEWAY_BASE_URL}/api/auth/login",
                json={"username": GATEWAY_USERNAME, "password": GATEWAY_PASSWORD},
            )
            if r.status_code != 200:
                raise GatewayConfigError(
                    f"Gateway admin login lỗi: HTTP {r.status_code} — "
                    f"kiểm tra GATEWAY_ADMIN_USERNAME / PASSWORD."
                )
            data = r.json()
            self.token = data["access_token"]
            self.expires_at = time.time() + int(data.get("expires_in", 43200))
            return self.token

    async def get(self) -> str:
        if not self.is_valid():
            return await self.refresh()
        assert self.token is not None
        return self.token


_token_cache = _TokenCache()


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy(path: str, request: Request, admin: AdminUser) -> Response:
    """Forward {path} (everything after /api/gateway-proxy/) to gatewaygrok.

    Body, query, and a curated subset of headers are passed through. The
    Authorization header is rewritten to use the cached gateway token.
    On 401 we refresh once and retry.
    """
    body = await request.body()
    # Drop hop-by-hop and host-specific headers that would mislead the
    # downstream service. Pass content-type and accept so JSON / multipart
    # bodies work.
    fwd_headers: dict[str, str] = {}
    for h in ("content-type", "accept", "x-api-key"):
        v = request.headers.get(h)
        if v:
            fwd_headers[h] = v

    async def _send(token: str) -> httpx.Response:
        fwd_headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=120) as cli:
            return await cli.request(
                method=request.method,
                url=f"{GATEWAY_BASE_URL}/{path}",
                params=dict(request.query_params),
                content=body if body else None,
                headers=fwd_headers,
            )

    token = await _token_cache.get()
    upstream = await _send(token)

    # Token-expired? Force re-login once and retry.
    if upstream.status_code == 401:
        token = await _token_cache.refresh()
        upstream = await _send(token)

    # Pass through status + body. Strip hop-by-hop headers; keep content-type.
    headers = {}
    for k, v in upstream.headers.items():
        if k.lower() not in {"content-encoding", "content-length", "transfer-encoding", "connection"}:
            headers[k] = v
    media_type = upstream.headers.get("content-type", "application/json")

    # JSON bodies are common — try to decode for nicer error propagation.
    if media_type.startswith("application/json"):
        try:
            return JSONResponse(
                content=upstream.json(),
                status_code=upstream.status_code,
                headers={k: v for k, v in headers.items() if k.lower() != "content-type"},
            )
        except Exception:  # noqa: BLE001
            pass

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=headers,
        media_type=media_type,
    )
