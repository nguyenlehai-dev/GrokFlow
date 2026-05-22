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
    prompt: str = Field(min_length=1, max_length=16000)
    ratio: str | None = None
    count: int = Field(default=1, ge=1, le=10)
    reference_images: list[str] | None = None


class VideoGenerateIn(BaseModel):
    """Minimal payload for the simplified video endpoint.

    Same as ImageGenerateIn + `duration` (seconds, optional).
    `reference_images` present → I2V (animate the still); absent → T2V.
    """
    prompt: str = Field(min_length=1, max_length=16000)
    ratio: str | None = None
    duration: int | None = None
    count: int = Field(default=1, ge=1, le=10)
    reference_images: list[str] | None = None


# Legacy shape — DO NOT modify. Add new fields to NEW endpoints instead.
class ClientGenerateIn(BaseModel):
    target: Literal["image", "video"]
    prompt: str = Field(min_length=1, max_length=16000)
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


# ───────────── legacy-compatible shapes (matches flowgrok.plxeditor.com)

class ClientLiteStatusOut(BaseModel):
    """Lite poll envelope — matches flowgrok.plxeditor.com /api/client
    /tasks/{id}/status and /generate/status response."""
    task_id: uuid.UUID
    status: str
    success: bool
    message: str
    url: str | None = None


class ClientTaskFullOut(BaseModel):
    """Full Job shape — matches flowgrok.plxeditor.com /api/client
    /tasks/{id} response (12 fields with provider_payload + result_payload)."""
    id: uuid.UUID
    profile_id: uuid.UUID | None = None
    target: str
    status: str
    prompt: str
    negative_prompt: str | None = None
    count: int
    provider_payload: dict[str, Any] | None = None
    result_payload: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class ClientVerifyOut(BaseModel):
    """Health-check envelope — partner pings /verify on boot to fail
    fast on bad/revoked keys."""
    status: str
    name: str
    key_prefix: str


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
        return f"{base_url}/api/files/{f.id}"

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

@router.get("/tasks/{task_id}/status", response_model=ClientLiteStatusOut)
async def get_task_status(
    task_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
    request: Request,
) -> ClientLiteStatusOut:
    """Lite poll envelope — matches flowgrok.plxeditor.com.

    NOTE shape change (2026-05): previously returned the full
    ClientTaskStatusOut with image_urls/video_urls; now returns the lite
    {task_id,status,success,message,url} envelope per the legacy spec.
    If your integration needs the full list of media URLs, call
    /api/client/tasks/{task_id} (full) or /api/client/status/{task_id}
    (kept as ClientTaskStatusOut for backwards compat).
    """
    _, user = principal
    return await _build_lite(task_id, user, db, request)


# ─────────────────────────────────────────────────────────────────────
# Legacy plxeditor flowgrok contract — full parity surface.
# Existing /generate + /status/{id} + /tasks/{id}/status above stay as
# they were for backwards-compat. The endpoints below add the
# legacy-shaped responses partners expect.
# ─────────────────────────────────────────────────────────────────────

def _job_to_full(job: Job, files: list[File], request: Request) -> ClientTaskFullOut:
    """Map internal Job + Files to the legacy ClientTaskFullOut shape.

    Job storage shape (from job_service.create_job):
      - job.prompt (column)            ← prompt text
      - job.input_payload (JSON)       ← options dict: ratio/quality/duration/...
                                          + optionally negative_prompt,
                                          reference_images, video_mode, image_mode
    Legacy ClientTaskFullOut wants both fields split out, plus a
    provider_payload mirroring what was sent to Grok.
    """
    base_url = _base_url(request)
    image_urls, video_urls = _collect_media_urls(
        files, target=job.job_type,
        requested_count=_requested_count(job),
        result_url=job.result_url, base_url=base_url,
    )
    media_urls = (video_urls or []) + (image_urls or [])

    opts = job.input_payload or {}
    # Infer image_mode / video_mode if the original request specified it
    # via provider_payload override OR a reference_images list.
    has_reference = bool(opts.get("reference_images"))
    inferred_image_mode = (
        opts.get("image_mode")
        or ("image_to_image" if has_reference and job.job_type == "image" else "text_to_image" if job.job_type == "image" else None)
    )
    inferred_video_mode = (
        opts.get("video_mode")
        or ("image_to_video" if has_reference and job.job_type == "video" else "text_to_video" if job.job_type == "video" else None)
    )

    provider_payload = {
        "video_mode": inferred_video_mode,
        "image_mode": inferred_image_mode,
        "aspect_ratio": opts.get("ratio"),
        "quality": opts.get("quality"),
        "duration": opts.get("duration"),
        "source_asset_path": (opts.get("reference_images") or [None])[0],
    }
    provider_payload = {k: v for k, v in provider_payload.items() if v is not None}

    result_payload: dict[str, Any] | None = None
    if job.status == "success" and media_urls:
        result_payload = {
            "target": job.job_type,
            "image_mode": inferred_image_mode,
            "video_mode": inferred_video_mode,
            "media_urls": media_urls,
            "applied_options": opts.get("applied_options") or {},
            "unapplied_options": opts.get("unapplied_options") or {},
            "provider": job.provider or "grok",
            "page_url": f"https://grok.com/{'video' if job.job_type=='video' else 'imagine'}",
            "used_live_browser": True,
        }

    err_msg = job.error_message if job.status in _TERMINAL else None

    return ClientTaskFullOut(
        id=job.id,
        profile_id=job.profile_id,
        target=job.job_type,
        status=job.status,
        prompt=job.prompt or "",
        negative_prompt=opts.get("negative_prompt"),
        count=_requested_count(job),
        provider_payload=provider_payload or None,
        result_payload=result_payload,
        error_message=err_msg,
        created_at=job.created_at,
        updated_at=job.completed_at or job.updated_at or job.created_at,
    )


async def _build_lite(task_id: uuid.UUID, user, db, request: Request) -> ClientLiteStatusOut:
    """Compute the lite poll envelope. First media URL only — clients
    needing the full list call /tasks/{id} instead."""
    job = await db.get(Job, task_id)
    if not job or job.user_id != user.id:
        raise NotFound("task")
    url = None
    if job.status == "success":
        files = list((await db.execute(
            select(File).where(File.job_id == job.id, File.file_type != "input")
            .order_by(File.created_at)
        )).scalars().all())
        image_urls, video_urls = _collect_media_urls(
            files, target=job.job_type,
            requested_count=_requested_count(job),
            result_url=job.result_url, base_url=_base_url(request),
        )
        url = (video_urls + image_urls)[0] if (video_urls or image_urls) else None
    msg = job.error_message if job.status == "failed" else job.status
    return ClientLiteStatusOut(
        task_id=job.id, status=job.status,
        success=(job.status == "success"),
        message=msg or job.status, url=url,
    )


@router.get("/verify", response_model=ClientVerifyOut)
async def verify_key(principal: ApiKeyPrincipal) -> ClientVerifyOut:
    """Partner ping — verify the API key is alive + readable without
    burning quota. Matches flowgrok.plxeditor.com /api/client/verify."""
    api_key, _ = principal
    return ClientVerifyOut(
        status="ok",
        name=api_key.name,
        key_prefix=api_key.key_prefix,
    )


# --------------------------------------------------------------------------
# Chat — pure HTTP path (no browser)
# --------------------------------------------------------------------------

class ChatIn(BaseModel):
    """Plain text-chat request.

    Goes through the API-only path (no Playwright / no Chromium) — reuses
    the same cookies / x-statsig-id that the live profile holds, then
    posts to grok.com/rest/app-chat/conversations/new and streams the
    response. Typical latency 2-6s for a short reply.
    """
    prompt: str = Field(min_length=1, max_length=16000)
    model: str | None = Field(default=None, description="e.g. 'grok-3', 'grok-2-mini'. Omit = default")
    profile_id: uuid.UUID | None = Field(default=None, description="Force a specific profile; auto-pick if omitted")
    project_id: str | None = Field(default=None, description="Scope the conversation to a Grok project")


class ChatOut(BaseModel):
    message: str
    conversation_id: str | None = None
    response_id: str | None = None
    model: str
    latency_ms: int


@router.post("/chat", response_model=ChatOut)
async def chat(
    payload: ChatIn, principal: ApiKeyPrincipal, db: DbSession,
) -> ChatOut:
    """Pure-HTTP text chat against Grok via /conversations/new.

    Resolves a healthy profile from the user's pool, captures its
    cookies + statsig ID, then calls Grok's chat endpoint directly.
    No Chromium tab opened for this request — the only browser session
    that ever needs to exist is the one the admin used to log the
    profile in originally.

    Returns the full assembled message + conversation metadata.
    """
    from sqlalchemy import select as _select
    from app.models import Profile as _Profile
    from app.providers.base import JobInput as _JobInput
    from app.providers.grok_provider import GrokProvider as _GrokProvider
    from app.providers.grok_api_client import GrokAPIError as _GrokAPIError

    api_key, user = principal
    # Provider check only — chat is not a job_type in the legacy enum
    # (it never goes through the job queue), so the per-job_type
    # whitelist on the API key doesn't apply.
    if api_key.allowed_providers and "grok" not in api_key.allowed_providers:
        raise PermissionDenied("API key not allowed for provider 'grok'")
    await enforce_api_key_rate_limit(api_key)

    # Resolve a profile via the shared job-service resolver — same rules
    # the generate endpoints use (domain scoping + cross-tenant project
    # assignments). Means a partner API key can hit /chat with the same
    # entitlements it has for /generate, no separate config needed.
    from app.modules.grok.jobs.service import _resolve_profile_for_job as _resolve
    if payload.profile_id:
        prof = await db.get(_Profile, payload.profile_id)
        if not prof or prof.provider != "grok":
            raise NotFound("profile")
    else:
        prof = await _resolve(
            db,
            requested_id=None,
            user_id=user.id,
            provider="grok",
            job_type="image",  # any non-video job_type works for chat
        )
        if prof is None:
            raise NotFound("no logged_in grok profile available")

    provider = _GrokProvider()
    # _build_api_session opens CDP, grabs cookies + x-statsig-id, builds
    # an httpx-ready GrokAPIClient. The same call powers _run_image_via_api.
    session = await provider._build_api_session(_JobInput(
        prompt="", job_type="image", options=None,
        profile_path=prof.profile_path,
    ))
    if session is None:
        raise PermissionDenied("Could not extract Grok session — profile may need re-login")
    client, _pid, _tag = session

    try:
        result = await client.chat(
            prompt=payload.prompt,
            project_id=payload.project_id,
            model=payload.model,
        )
    except _GrokAPIError as exc:
        if exc.code == "cookie_expired":
            raise PermissionDenied(f"Grok session expired: {exc.message}")
        if exc.code == "provider_blocked":
            raise PermissionDenied(f"Grok rejected the call: {exc.message}")
        raise

    # Audit + usage bump on success path only — failure already raised.
    api_key.last_used_at = datetime.now(timezone.utc)
    api_key.used_today += 1
    await audit.log_action(
        db, user_id=user.id, action="chat",
        target_type="profile", target_id=prof.id,
        metadata={"latency_ms": result["latency_ms"], "model": result["model"]},
    )
    await db.commit()

    return ChatOut(
        message=result["message"],
        conversation_id=result["conversation_id"],
        response_id=result["response_id"],
        model=result["model"],
        latency_ms=result["latency_ms"],
    )


@router.post("/generate/status", response_model=ClientLiteStatusOut, status_code=201)
async def generate_lite(
    payload: ClientGenerateIn, principal: ApiKeyPrincipal,
    db: DbSession, request: Request,
) -> ClientLiteStatusOut:
    """Same as /generate but returns the lite envelope ({task_id, status,
    success, message, url}). Convenient for clients that only need the
    task_id back and poll /tasks/{id}/status afterwards."""
    full = await _submit_job(
        target=payload.target,
        payload_dict=payload.model_dump(),
        options=_build_options(payload),
        profile_id=payload.profile_id,
        principal=principal, db=db,
    )
    return ClientLiteStatusOut(
        task_id=full.task_id, status=full.status,
        success=False, message="pending", url=None,
    )


@router.get("/tasks/{task_id}", response_model=ClientTaskFullOut)
async def get_task_full(
    task_id: uuid.UUID, principal: ApiKeyPrincipal,
    db: DbSession, request: Request,
) -> ClientTaskFullOut:
    """Full Job record — includes provider_payload (raw options sent to
    Grok) and result_payload (media_urls + applied_options + ...).
    Use this when you need everything; otherwise /tasks/{id}/status."""
    _, user = principal
    job = await db.get(Job, task_id)
    if not job or job.user_id != user.id:
        raise NotFound("task")
    files = list((await db.execute(
        select(File).where(File.job_id == job.id, File.file_type != "input")
        .order_by(File.created_at)
    )).scalars().all())
    return _job_to_full(job, files, request)


# Aliases — /jobs/* mirrors /tasks/* for clients on the legacy URL.

@router.post("/jobs", response_model=ClientGenerateOut, status_code=201)
async def generate_alias(
    payload: ClientGenerateIn, principal: ApiKeyPrincipal, db: DbSession,
) -> ClientGenerateOut:
    """Legacy alias of /generate. Returns the same compact response."""
    return await generate(payload, principal, db)


@router.get("/jobs/{task_id}", response_model=ClientTaskFullOut)
async def get_job_full_alias(
    task_id: uuid.UUID, principal: ApiKeyPrincipal,
    db: DbSession, request: Request,
) -> ClientTaskFullOut:
    """Legacy alias of /tasks/{task_id}."""
    return await get_task_full(task_id, principal, db, request)


@router.get("/jobs/{task_id}/status", response_model=ClientLiteStatusOut)
async def get_job_status_alias(
    task_id: uuid.UUID, principal: ApiKeyPrincipal,
    db: DbSession, request: Request,
) -> ClientLiteStatusOut:
    """Legacy alias of /tasks/{task_id}/status (lite envelope)."""
    _, user = principal
    return await _build_lite(task_id, user, db, request)
