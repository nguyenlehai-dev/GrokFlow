"""Hello-world module backend.

Demonstrates the SDK contract:
- /health for the core to liveness-check
- /me proxy that verifies the user JWT through core SDK and returns user info
"""

import os
from typing import Annotated

import httpx
from fastapi import FastAPI, Header, HTTPException, Request


app = FastAPI(title="Hello World Module")

# Core injects these at spawn time
GROKFLOW_API_URL = os.environ.get("GROKFLOW_API_URL", "http://grokflow-backend-1:8000/api/sdk")
SERVICE_TOKEN = os.environ.get("GROKFLOW_SERVICE_TOKEN", "")
MODULE_SLUG = os.environ.get("MODULE_SLUG", "hello_world")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "module": MODULE_SLUG}


@app.get("/api/me")
async def me(authorization: Annotated[str | None, Header()] = None) -> dict:
    """Return info of the user currently using this module.

    Frontend sends the user JWT (received via iframe URL `?token=...`) in
    the Authorization header; we forward it to core /api/sdk/users/me.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="missing Authorization")
    token = authorization.removeprefix("Bearer ").strip()

    async with httpx.AsyncClient(base_url=GROKFLOW_API_URL, timeout=5.0) as client:
        r = await client.get(
            "/users/me",
            headers={
                "X-GrokFlow-Service-Token": SERVICE_TOKEN,
                "X-GrokFlow-User-Token": token,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()
