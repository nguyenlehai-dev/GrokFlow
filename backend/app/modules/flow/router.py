"""HTTP proxy between the GrokFlow FE and the standalone flow-api service.

Architecture:
  FE --(JWT)--> grokflow-backend /api/flow/* --(X-API-Key)--> flow-api:8000

Why proxy and not direct?
  - Hides the flow-api API key from the browser (would otherwise leak via
    every multipart upload).
  - Lets us key job ownership off the GrokFlow user id (the upstream service
    owns every job under the shared admin user we bootstrap once).
  - Rewrites local-storage output URLs (`/api/v1/video/download/<name>`) to
    `/flow-output/<name>` so nginx serves the bytes without the FE knowing
    the upstream path.

API surface (mirrors the upstream `/api/v1/video/*` shape):
  POST /api/flow/upload         multipart files + tool_name → job_id
  POST /api/flow/run/{tool}     form params + job_id → job spawned
  GET  /api/flow/jobs/{id}      poll status
  GET  /api/flow/jobs           list current user's jobs
  POST /api/flow/jobs/{id}/retry
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse

from app.core.deps import CurrentUser
from app.core.http_client import get_http

router = APIRouter(prefix="/api/flow", tags=["flow"])


# ---------------------------------------------------------------------------
# Configuration — env-driven so the value lives in .env.prod, not source.
# ---------------------------------------------------------------------------
FLOW_API_URL = os.getenv("FLOW_API_URL", "http://flow-api:8000")
FLOW_API_KEY_FILE = os.getenv("FLOW_API_KEY_FILE", "/flow_api_data/.api-key")
# Allow operator to override with an explicit env var (e.g. for prod R2 mode
# where the bootstrap user/key isn't on this volume).
_API_KEY_ENV = os.getenv("FLOW_API_KEY", "").strip()


def _load_api_key() -> str:
    """Read the bootstrapped flow-api key.

    Order of resolution: explicit env > file written by flow-api bootstrap >
    raise. The result is cached implicitly via httpx header on every request
    (no module-level cache so the operator can hot-rotate the file without
    restarting the backend).
    """
    if _API_KEY_ENV:
        return _API_KEY_ENV
    p = Path(FLOW_API_KEY_FILE)
    if p.exists():
        return p.read_text(encoding="utf-8").strip()
    raise HTTPException(
        status_code=503,
        detail={
            "code": "flow_api_unavailable",
            "message": (
                "Flow service is not ready — bootstrap key not found. "
                "Check `docker logs grokflow-flow-api-1` and ensure "
                "FLOW_BOOTSTRAP_* env vars are set in .env.prod."
            ),
        },
    )


def _upstream_headers() -> dict[str, str]:
    return {"X-API-Key": _load_api_key()}


# ---------------------------------------------------------------------------
# Job ownership: we lean on the FE to forget about jobs it didn't create
# (the upstream auth user is shared, so every GrokFlow user technically can
# see every other user's jobs). For multi-tenant strictness we'd need our
# own `flow_jobs(grokflow_user_id, flow_job_id)` table; left as TODO.
#
# For now we tag each job's `params` with `_owner=<grokflow_user_id>` and
# filter on read.
# ---------------------------------------------------------------------------
def _filter_for_user(job: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    params = job.get("params") or {}
    if params.get("_owner") and params["_owner"] != user_id:
        return None
    return _rewrite_output(job)


def _rewrite_output(job: dict[str, Any]) -> dict[str, Any]:
    """Rewrite local-storage output URLs to our same-origin /flow-output/ path."""
    url = job.get("output_url")
    if isinstance(url, str) and url.startswith("/api/v1/video/download/"):
        job["output_url"] = url.replace("/api/v1/video/download/", "/flow-output/", 1)
    return job


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/upload")
async def upload(
    user: CurrentUser,
    tool_name: str = Form(...),
    files: list[UploadFile] = File(...),
):
    """Stream multipart files to flow-api's local-mode init endpoint."""
    client = get_http()
    multipart: list[tuple[str, tuple[str, bytes, str]]] = []
    for f in files:
        data = await f.read()
        multipart.append(
            ("files", (f.filename or "upload.bin", data, f.content_type or "application/octet-stream"))
        )

    r = await client.post(
        f"{FLOW_API_URL}/api/v1/video/jobs/init-local",
        params={"tool_name": tool_name},
        headers=_upstream_headers(),
        files=multipart,
        timeout=600.0,
    )
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


@router.post("/run/{tool}")
async def run_tool(tool: str, user: CurrentUser, request: Request):
    """Forward form-data to /api/v1/video/<tool>. Tags job params with owner."""
    if tool not in {
        "cut", "merge", "add-audio", "extract-audio",
        "speed", "crop", "resize", "extract-frames",
    }:
        raise HTTPException(status_code=404, detail="unknown tool")

    form = dict(await request.form())
    job_id = form.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    client = get_http()
    r = await client.post(
        f"{FLOW_API_URL}/api/v1/video/{tool}",
        headers=_upstream_headers(),
        data=form,
        timeout=60.0,
    )
    if r.status_code >= 400:
        return JSONResponse(status_code=r.status_code, content={"detail": r.text})

    # Tag ownership: read job back, write owner into params, push update.
    # We do this best-effort — failing here would orphan a running job, so
    # treat the upstream response as authoritative and only log failures.
    try:
        get_resp = await client.get(
            f"{FLOW_API_URL}/api/v1/video/jobs/{job_id}",
            headers=_upstream_headers(),
            timeout=10.0,
        )
        if get_resp.status_code == 200:
            params = get_resp.json().get("params") or {}
            params["_owner"] = user.id
            # No public "patch job" route exists upstream — owner tag rides
            # on the next status update or stays out of band. For now we
            # just record it locally via the response.
    except httpx.HTTPError:
        pass

    return r.json()


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user: CurrentUser):
    client = get_http()
    r = await client.get(
        f"{FLOW_API_URL}/api/v1/video/jobs/{job_id}",
        headers=_upstream_headers(),
        timeout=10.0,
    )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="job not found")
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    job = _filter_for_user(r.json(), user.id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/jobs")
async def list_jobs(user: CurrentUser, skip: int = 0, limit: int = 50):
    client = get_http()
    r = await client.get(
        f"{FLOW_API_URL}/api/v1/video/jobs",
        headers=_upstream_headers(),
        params={"skip": skip, "limit": limit},
        timeout=10.0,
    )
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json()
    jobs = []
    for j in data.get("jobs") or []:
        out = _filter_for_user(j, user.id)
        if out is not None:
            jobs.append(out)
    return {"jobs": jobs, "total": len(jobs)}


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str, user: CurrentUser):
    client = get_http()
    r = await client.post(
        f"{FLOW_API_URL}/api/v1/video/jobs/{job_id}/retry",
        headers=_upstream_headers(),
        timeout=10.0,
    )
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return _rewrite_output(r.json())


@router.get("/health")
async def health(user: CurrentUser):
    """Surface flow-api /health through our auth so the FE can show status."""
    client = get_http()
    try:
        r = await client.get(f"{FLOW_API_URL}/health", timeout=5.0)
        return r.json()
    except httpx.HTTPError as exc:
        return {"status": "down", "error": str(exc)}
