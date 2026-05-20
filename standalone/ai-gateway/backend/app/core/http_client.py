"""Shared httpx.AsyncClient — one TCP/TLS pool for the whole process.

Why not `async with httpx.AsyncClient(...)` per call?
  Each new client opens a fresh connection pool, runs full TLS
  handshake, discards everything on exit. Gateway vendor calls fire
  back-to-back to the same hosts (api.openai.com, generativelanguage.
  googleapis.com), so a shared pool reuses keep-alive sockets and TLS
  sessions — easy 5-30% latency win at the gateway hot path.

Per-request timeouts (vendor calls 180s, webhooks 10s, list-models
20s) are still passed individually via `await client.get(url,
timeout=X)`. The client-level timeout is just a fallback ceiling.

Lifecycle: created on first `get_http()` call, closed in main.py's
lifespan `on_shutdown`. Single process-wide instance.
"""
from __future__ import annotations

import httpx

# Module-level instance — created lazily so a unit-test import doesn't
# eagerly open a connection pool.
_client: httpx.AsyncClient | None = None

# Hard cap so a runaway request can't hold a connection forever even
# when callers forget to pass their own timeout. Vendor + webhook
# call sites override this with `timeout=X` arg.
_DEFAULT_TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)

# Connection pool sizing — for ~4 gunicorn workers each hitting a few
# vendors concurrently, 50 keep-alive + 100 total is plenty.
_DEFAULT_LIMITS = httpx.Limits(
    max_keepalive_connections=50,
    max_connections=100,
    keepalive_expiry=60.0,
)


def get_http() -> httpx.AsyncClient:
    """Return the process-wide AsyncClient. Lazy-init on first call."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT,
            limits=_DEFAULT_LIMITS,
            # follow_redirects so vendor 301/302 (e.g. CDN moves) don't
            # surface to the gateway as opaque "302 No Content".
            follow_redirects=True,
        )
    return _client


async def close_http() -> None:
    """Tear down the shared client. Call from FastAPI lifespan shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
