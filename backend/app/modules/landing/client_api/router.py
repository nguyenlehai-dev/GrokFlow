"""Adapter routes implementing the partner-facing GrokService contract.

Contract (as requested by integration partners):

  POST /api/client/generate
       body  : { target: "image"|"video", prompt, ratio, count,
                 quality, duration, negative_prompt, reference_images[] }
       auth  : Authorization: Bearer <uxpm_live_*>
       reply : { task_id, status, target }

  GET  /api/client/tasks/{task_id}/status
       auth  : Authorization: Bearer <uxpm_live_*>
       reply : { task_id, status, target, image_urls[], video_urls[],
                 error_message, created_at, completed_at, result }

Both translate into the existing Grok job pipeline (same service layer
as `/v1/jobs/image` and `/v1/jobs/video`).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import ApiKeyPrincipal, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.core.rate_limit import enforce_api_key_rate_limit
from app.models import File, Job
from app.modules.admin.audit import service as audit
from app.modules.grok.jobs import service as job_service


router = APIRouter(prefix="/api/client", tags=["client-api"])


class ClientGenerateIn(BaseModel):
    target: Literal["image", "video"]
    prompt: str = Field(min_length=1, max_length=4000)
    ratio: str | None = None
    count: int = Field(default=1, ge=1, le=10)
    # Note: contract cap is 10; internal entitlement plan may cap lower per user.
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


def _collect_media_urls(
    files: list[File],
    *,
    target: str,
    requested_count: int,
    result_url: str | None,
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
        return f.public_url or f"/api/files/{f.id}/download"

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
    api_key, user = principal
    _check_perm(api_key, payload.target)
    await enforce_api_key_rate_limit(api_key)

    job = await job_service.create_job(
        db,
        user_id=user.id,
        provider="grok",
        job_type=payload.target,
        prompt=payload.prompt,
        profile_id=payload.profile_id,
        options=_build_options(payload),
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
            "job_type": payload.target,
            "via": "client_api",
        },
    )
    await db.commit()
    return ClientGenerateOut(
        task_id=job.id, status=job.status, target=payload.target,
    )


@router.get("/tasks/{task_id}/status", response_model=ClientTaskStatusOut)
async def get_task_status(
    task_id: uuid.UUID, principal: ApiKeyPrincipal, db: DbSession,
) -> ClientTaskStatusOut:
    _, user = principal
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
        )

    result_blob: dict[str, Any] | None = None
    if image_urls or video_urls:
        result_blob = {
            "image_urls": image_urls,
            "video_urls": video_urls,
        }

    return ClientTaskStatusOut(
        task_id=job.id,
        status=job.status,
        target=job.job_type,
        image_urls=image_urls,
        video_urls=video_urls,
        result=result_blob,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )
