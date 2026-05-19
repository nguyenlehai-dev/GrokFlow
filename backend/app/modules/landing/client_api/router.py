"""Partner-facing Grok API — FROZEN CONTRACT.

============================================================================
SIMPLE CONTRACT (partner-recommended — use these for new integrations)
============================================================================

  POST /api/client/generate-image
       body  : { prompt, ratio?, count?, reference_images?: string[] }
       reply : { task_id, status, target: "image" }

  POST /api/client/generate-video
       body  : { prompt, ratio?, duration?, count?, reference_images?: string[] }
       reply : { task_id, status, target: "video" }

  GET  /api/client/status/{task_id}
       reply : { task_id, status, target, image_urls[], video_urls[],
                 error_message, created_at, completed_at }

Auth (all 3 endpoints + downloads): Authorization: Bearer <uxpm_live_*>

============================================================================
LEGACY CONTRACT (kept verbatim for existing integrations — DO NOT BREAK)
============================================================================

  POST /api/client/generate
       body  : { target: "image"|"video", prompt, ratio?, count?,
                 quality?, duration?, negative_prompt?, reference_images? }
       reply : { task_id, status, target }

  GET  /api/client/tasks/{task_id}/status
       reply : same as /status/{task_id}

============================================================================

This file is a FROZEN contract. Internal logic (worker rotation, project
re-mapping, retry, file collection, etc.) may evolve freely — but the
request/response shape above must not change. Partners' production apps
break every time field names move. If you need a different shape, add
a NEW endpoint instead of mutating these ones.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import ApiKeyPrincipal, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.core.rate_limit import enforce_api_key_rate_limit
from app.models import File, Job
from app.modules.admin.audit import service as audit
from app.modules.grok.jobs import service as job_service


router = APIRouter(prefix="/api/client", tags=["client-api"])


class ImageGenerateIn(BaseModel):
    """Minimal payload for the simplified image endpoint.

    No `target` field (it's implicit in the URL), no `quality` /
    `negative_prompt` (partner feedback: noise, not used). Just the
    knobs that matter: prompt + ratio + how many variants + optional
    reference images for I2I.
    """
    prompt: str = Field(min_length=1, max_length=4000)
    ratio: str | None = None
    count: int = Field(default=1, ge=1, le=10)
    reference_images: list[str] | None = None


class VideoGenerateIn(BaseModel):
    """Minimal payload for the simplified video endpoint.

    Same as ImageGenerateIn + `duration` (seconds, optional).
    `reference_images` present → I2V (animate the still); absent → T2V.
    """
    prompt: str = Field(min_length=1, max_length=4000)
    ratio: str | None = None
    duration: int | None = None
    count: int = Field(default=1, ge=1, le=10)
    reference_images: list[str] | None = None


# Legacy shape — DO NOT modify. Add new fields to NEW endpoints instead.
class ClientGenerateIn(BaseModel):
    target: Literal["image", "video"]
    prompt: str = Field(min_length=1, max_length=4000)
    ratio: str | None = None
    count: int = Field(default=1, ge=1, le=10)
    quality: str | None = None
    duration: int | None = None
    negative_prompt: str | None = None
    reference_images: list[str] | None = None
    profile_id: uuid.UUID | None = None


class ClientGenerateOut(BaseModel):
    task_id: uuid.UUID
    status: str
    target: str


class ClientTaskStatusOut(BaseModel):
    task_id: uuid.UUID
    status: str
    target: str
    image_urls: list[str]
    video_urls: list[str]
    result: dict[str, Any] | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


def _check_perm(api_key, target: str) -> None:
    if api_key.allowed_providers and "grok" not in api_key.allowed_providers:
        raise PermissionDenied("API key not allowed for provider 'grok'")
    if api_key.allowed_job_types and target not in api_key.allowed_job_types:
        raise PermissionDenied(f"API key not allowed for job_type '{target}'")


def _build_options(p: ClientGenerateIn) -> dict[str, Any] | None:
    opts: dict[str, Any] = {}
    if p.ratio:
        # Mirror both keys — the internal worker uses `aspect_ratio`, but
        # partners sometimes inspect the stored payload with the original
        # `ratio` name.
        opts["ratio"] = p.ratio
        opts["aspect_ratio"] = p.ratio
    if p.quality:
        opts["quality"] = p.quality
    if p.duration is not None:
        opts["duration"] = p.duration
    if p.negative_prompt:
        opts["negative_prompt"] = p.negative_prompt
    if p.count != 1:
        opts["n"] = p.count
    if p.reference_images:
        opts["reference_images"] = p.reference_images
        opts["reference_image_urls"] = p.reference_images
    return opts or None


def _base_url(request: Request) -> str:
    """Compute the absolute origin for response URLs.

    Partners reported that `image_urls: ["/api/files/<id>/download"]`
    forced them to manually prepend a base URL — and most just pasted
    the relative path into curl, getting cryptic errors. The contract
    now returns full https://host/api/files/<id>/download.

    Scheme detection priority:
      1. cf-visitor JSON header (Cloudflare's source of truth — the
         tunnel between CF and origin is plaintext HTTP, but cf-visitor
         tells us the client→CF scheme was https).
      2. x-forwarded-proto (host nginx might set this — many don't).
      3. request.url.scheme (raw uvicorn — would be http behind any proxy).
      4. Hardcoded https for any non-localhost host (production
         deploys are always behind TLS; localhost gets http).
    """
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host:
        host = request.url.netloc

    proto: str | None = None
    cf_visitor = request.headers.get("cf-visitor")
    if cf_visitor and '"scheme":"https"' in cf_visitor:
        proto = "https"
    elif cf_visitor and '"scheme":"http"' in cf_visitor:
        proto = "http"
    if not proto:
        proto = request.headers.get("x-forwarded-proto")
    if not proto:
        proto = request.url.scheme
    # Last resort: any non-localhost hostname in prod is https-only.
    if not proto or (proto == "http" and host and not host.startswith(("localhost", "127.0.0.1"))):
        proto = "https"
    return f"{proto}://{host}"


def _collect_media_urls(
    files: list[File],
    *,
    target: str,
    requested_count: int,
    result_url: str | None,
    base_url: str,
) -> tuple[list[str], list[str]]:
    """Split files by mime + cap the count returned to what the partner asked.

    Background: Grok's video streaming endpoint emits multiple progress=100
    events when its model generates several candidate clips for one prompt
    (we've observed 13 separate .mp4 files for a `count=1` request). The
    worker saves every one of them to the files table because they're
    legitimate outputs — but the partner contract promised `count: 1`,
    so dumping 13 URLs is confusing.

    Cap policy:
      - image: return up to `requested_count` URLs in file order
        (variants from one prompt are interchangeable; first N is fine)
      - video: prefer Job.result_url as the canonical answer; if it
        exists and matches, return just that one (count=1) or pad up
        to `requested_count` from the remaining variants
      - target='video' with count>1: take the LATEST N by created_at
        (the model's later samples are usually the more refined)
    """
    image_files: list[File] = []
    video_files: list[File] = []
    for f in files:
        if (f.mime_type or "").startswith("video/"):
            video_files.append(f)
        else:
            image_files.append(f)

    def _url(f: File) -> str:
        # Public URL `/api/file/<id>` — RESTful-ish singular shape that
        # partners requested. Same Replicate / OpenAI pattern: the file_id
        # IS the secret (UUIDv4 = 122 bits of entropy → unguessable).
        # Partners paste directly into browsers, HTML <img src>, messaging
        # apps, CDN caches, link-unfurl bots — all work without an
        # Authorization header. Public CDN URLs (f.public_url, when
        # configured) stay absolute as-is.
        if f.public_url and (
            f.public_url.startswith("http://") or f.public_url.startswith("https://")
        ):
            return f.public_url
        return f"{base_url}/api/file/{f.id}"

    n = max(1, requested_count)

    if target == "video":
        # Sort newest-first; the model's later samples tend to be the
        # most refined version Grok emitted for the prompt.
        ordered = sorted(video_files, key=lambda f: f.created_at, reverse=True)
        chosen: list[File] = []
        if result_url:
            # Honor what the worker pinned as the canonical result.
            primary = next(
                (f for f in ordered if result_url.endswith(f"/{f.id}/download")),
                None,
            )
            if primary is not None:
                chosen.append(primary)
        for f in ordered:
            if len(chosen) >= n:
                break
            if f in chosen:
                continue
            chosen.append(f)
        video_urls = [_url(f) for f in chosen]
        image_urls = [_url(f) for f in image_files][:n]
        return image_urls, video_urls

    # target == "image" (or unknown — treat as image)
    image_urls = [_url(f) for f in image_files][:n]
    video_urls = [_url(f) for f in video_files][:n]
    return image_urls, video_urls


def _requested_count(job: Job) -> int:
    """Recover the `count`/`n` the partner asked for. Falls back to 1."""
    payload = job.input_payload or {}
    for key in ("count", "n"):
        val = payload.get(key)
        if isinstance(val, int) and val >= 1:
            return val
    return 1


@router.post("/generate", response_model=ClientGenerateOut, status_code=201)
async def generate(
    payload: ClientGenerateIn, principal: ApiKeyPrincipal, db: DbSession,
) -> ClientGenerateOut:
    """Legacy gated endpoint. Prefer /generate-image or /generate-video."""
    return await _submit_job(
        target=payload.target,
        payload_dict=payload.model_dump(),
        options=_build_options(payload),
        profile_id=payload.profile_id,
        principal=principal,
        db=db,
    )


_TERMINAL = {"success", "failed", "cancelled"}


async def _build_status(
    task_id: uuid.UUID,
    user,
    db,
    request: Request,
) -> ClientTaskStatusOut:
    """Shared status builder for /status/{id} and /tasks/{id}/status."""
    job = await db.get(Job, task_id)
    if not job or job.user_id != user.id:
        raise NotFound("task")

    image_urls: list[str] = []
    video_urls: list[str] = []
    if job.status == "success":
        rows = list((await db.execute(
            select(File)
            .where(File.job_id == job.id, File.file_type != "input")
            .order_by(File.created_at)
        )).scalars().all())
        image_urls, video_urls = _collect_media_urls(
            rows,
            target=job.job_type,
            requested_count=_requested_count(job),
            result_url=job.result_url,
            base_url=_base_url(request),
        )

    result_blob: dict[str, Any] | None = None
    if image_urls or video_urls:
        result_blob = {
            "image_urls": image_urls,
            "video_urls": video_urls,
        }

    # Hide the error_message until status is terminal. While a job is
    # in queued/processing_provider, error_message holds the LAST FAILED
    # ATTEMPT's reason (e.g., "rate_limited — Rotating"). Partners were
    # reading it mid-retry and assuming the job had failed when it was
    # actually still trying. Only expose it when status is terminal.
    err_msg = job.error_message if job.status in _TERMINAL else None

    return ClientTaskStatusOut(
        task_id=job.id,
        status=job.status,
        target=job.job_type,
        image_urls=image_urls,
        video_urls=video_urls,
        result=result_blob,
        error_message=err_msg,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


async def _submit_job(
    *,
    target: str,
    payload_dict: dict[str, Any],
    options: dict[str, Any] | None,
    profile_id: uuid.UUID | None,
    principal,
    db,
) -> ClientGenerateOut:
    """Shared job-submission flow used by all 3 generate endpoints."""
    api_key, user = principal
    _check_perm(api_key, target)
    await enforce_api_key_rate_limit(api_key)

    job = await job_service.create_job(
        db,
        user_id=user.id,
        provider="grok",
        job_type=target,
        prompt=payload_dict["prompt"],
        profile_id=profile_id,
        options=options,
        api_key_id=api_key.id,
    )
    api_key.last_used_at = datetime.now(timezone.utc)
    api_key.used_today += 1
    await audit.log_action(
        db,
        user_id=user.id,
        action="create_job",
        target_type="job",
        target_id=job.id,
        metadata={
            "provider": "grok",
            "job_type": target,
            "via": "client_api",
        },
    )
    await db.commit()
    return ClientGenerateOut(task_id=job.id, status=job.status, target=target)


# ────────────────────────── NEW SIMPLE CONTRACT ──────────────────────────
# 3 endpoints. Frozen. Don't change the request/response shape.

@router.post("/generate-image", response_model=ClientGenerateOut, status_code=201)
async def generate_image(
    payload: ImageGenerateIn, principal: ApiKeyPrincipal, db: DbSession,
) -> ClientGenerateOut:
    """Generate image(s). Returns a task_id — poll /status/{task_id}."""
    opts: dict[str, Any] = {}
    if payload.ratio:
        opts["ratio"] = payload.ratio
        opts["aspect_ratio"] = payload.ratio
    if payload.count != 1:
        opts["n"] = payload.count
    if payload.reference_images:
        opts["reference_images"] = payload.reference_images
        opts["reference_image_urls"] = payload.reference_images
    return await _submit_job(
        target="image",
        payload_dict=payload.model_dump(),
        options=opts or None,
        profile_id=None,
        principal=principal,
        db=db,
    )


@router.post("/generate-video", response_model=ClientGenerateOut, status_code=201)
async def generate_video(
    payload: VideoGenerateIn, principal: ApiKeyPrincipal, db: DbSession,
) -> ClientGenerateOut:
    """Generate video(s). Returns a task_id — poll /status/{task_id}."""
    opts: dict[str, Any] = {}
    if payload.ratio:
        opts["ratio"] = payload.ratio
        opts["aspect_ratio"] = payload.ratio
    if payload.duration is not None:
        opts["duration"] = payload.duration
    if payload.count != 1:
        opts["n"] = payload.count
    if payload.reference_images:
        opts["reference_images"] = payload.reference_images
        opts["reference_image_urls"] = payload.reference_images
    return await _submit_job(
        target="video",
        payload_dict=payload.model_dump(),
        options=opts or None,
        profile_id=None,
        principal=principal,
        db=db,
    )


@router.get("/status/{task_id}", response_model=ClientTaskStatusOut)
async def get_status(
    task_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
    request: Request,
) -> ClientTaskStatusOut:
    """Check task status. Poll every 3-5s until status ∈
    {success, failed, cancelled}. Image URLs / video URLs are absolute."""
    _, user = principal
    return await _build_status(task_id, user, db, request)


# ───────────────────────── LEGACY CONTRACT (kept) ─────────────────────────
# Existing integrations may already point at these. Don't break them.

@router.get("/tasks/{task_id}/status", response_model=ClientTaskStatusOut)
async def get_task_status(
    task_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
    request: Request,
) -> ClientTaskStatusOut:
    _, user = principal
    return await _build_status(task_id, user, db, request)
