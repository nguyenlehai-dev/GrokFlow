import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File as FastapiFile, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import ApiKeyPrincipal, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.core.rate_limit import enforce_api_key_rate_limit
from app.models import File, Job
from app.modules.admin.audit import service as audit
from app.modules.grok.files import service as files_service
from app.modules.grok.jobs import service as job_service

router = APIRouter(prefix="/v1", tags=["public-v1"])


class PublicJobCreate(BaseModel):
    provider: str = Field(pattern="^(grok|flow)$")
    profile_id: uuid.UUID | None = None
    prompt: str = Field(min_length=1, max_length=16000)
    options: dict[str, Any] | None = None
    # Optional reference image for image-to-image / image-to-video. Get the
    # file_id by first POSTing to `/v1/jobs/upload-input` — that endpoint
    # also probes Grok content moderation, so a bad image is rejected at
    # upload time (HTTP 400) instead of silently failing the job.
    input_image_file_id: uuid.UUID | None = None


class PublicJobAck(BaseModel):
    job_id: uuid.UUID
    status: str
    message: str = "Job đã được đưa vào hàng đợi."


class PublicUploadOut(BaseModel):
    file_id: uuid.UUID
    file_name: str
    mime_type: str
    file_size: int


class PublicBulkDeleteIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class PublicBulkDeleteOut(BaseModel):
    deleted: int
    skipped_in_flight: int
    skipped_not_owned: int


class PublicJobOut(BaseModel):
    job_id: uuid.UUID
    status: str
    result_url: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


def _check_perm(api_key, provider: str, job_type: str) -> None:
    if api_key.allowed_providers and provider not in api_key.allowed_providers:
        raise PermissionDenied(f"API key not allowed for provider '{provider}'")
    if api_key.allowed_job_types and job_type not in api_key.allowed_job_types:
        raise PermissionDenied(f"API key not allowed for job_type '{job_type}'")


async def _bump_usage(db, api_key) -> None:
    api_key.last_used_at = datetime.now(timezone.utc)
    api_key.used_today += 1


def _merge_options_with_input_image(payload: PublicJobCreate) -> dict[str, Any] | None:
    """If caller set top-level `input_image_file_id`, mirror it into the
    options blob so the worker's resolver finds it (the resolver only
    looks at options for legacy reasons). Returns the merged options
    dict, or the original options if no input image was specified.
    """
    if payload.input_image_file_id is None:
        return payload.options
    opts = dict(payload.options or {})
    opts["input_image_file_id"] = str(payload.input_image_file_id)
    return opts


@router.post("/jobs/image", response_model=PublicJobAck, status_code=201)
async def create_image_job(payload: PublicJobCreate, principal: ApiKeyPrincipal, db: DbSession) -> PublicJobAck:
    api_key, user = principal
    _check_perm(api_key, payload.provider, "image")
    await enforce_api_key_rate_limit(api_key)
    job = await job_service.create_job(
        db,
        user_id=user.id,
        provider=payload.provider,
        job_type="image",
        prompt=payload.prompt,
        profile_id=payload.profile_id,
        options=_merge_options_with_input_image(payload),
        api_key_id=api_key.id,
    )
    await _bump_usage(db, api_key)
    await audit.log_action(db, user_id=user.id, action="create_job", target_type="job", target_id=job.id,
                           metadata={"provider": payload.provider, "job_type": "image", "via": "public_v1"})
    await db.commit()
    return PublicJobAck(job_id=job.id, status=job.status)


@router.post("/jobs/video", response_model=PublicJobAck, status_code=201)
async def create_video_job(payload: PublicJobCreate, principal: ApiKeyPrincipal, db: DbSession) -> PublicJobAck:
    api_key, user = principal
    _check_perm(api_key, payload.provider, "video")
    await enforce_api_key_rate_limit(api_key)
    job = await job_service.create_job(
        db,
        user_id=user.id,
        provider=payload.provider,
        job_type="video",
        prompt=payload.prompt,
        profile_id=payload.profile_id,
        options=_merge_options_with_input_image(payload),
        api_key_id=api_key.id,
    )
    await _bump_usage(db, api_key)
    await audit.log_action(db, user_id=user.id, action="create_job", target_type="job", target_id=job.id,
                           metadata={"provider": payload.provider, "job_type": "video", "via": "public_v1"})
    await db.commit()
    return PublicJobAck(job_id=job.id, status=job.status)


@router.post("/jobs/upload-input", response_model=PublicUploadOut, status_code=201)
async def upload_input_v1(
    principal: ApiKeyPrincipal,
    db: DbSession,
    file: UploadFile = FastapiFile(...),
) -> PublicUploadOut:
    """Upload a reference image for image-to-image / image-to-video jobs.

    Probes Grok content moderation BEFORE saving — if Grok rejects the
    image (NSFW / policy violation), the request fails with HTTP 400 and
    nothing is stored. The returned `file_id` is the value to pass as
    `input_image_file_id` when creating a job.

    Mirrors the JWT-authed `/api/jobs/upload-input` so external callers
    using just an API key get the same UX (no silent retries on
    moderated content).
    """
    api_key, user = principal
    if not file.content_type or not file.content_type.startswith("image/"):
        raise InvalidPayload("Only image/* uploads are accepted as input")
    raw = await file.read()
    if len(raw) > 20_000_000:
        raise InvalidPayload("Input image too large (>20MB)")

    # ── Pre-flight Grok moderation check ──
    from app.models import Profile
    from app.providers.grok_provider import GrokProvider
    from app.providers.grok_api_client import GrokAPIError
    from app.providers.base import JobInput

    probe_profile = (await db.execute(
        select(Profile)
        .where(Profile.provider == "grok", Profile.status == "logged_in")
        .order_by(Profile.last_used_at.desc().nulls_last())
        .limit(1)
    )).scalar_one_or_none()

    if probe_profile is not None:
        provider = GrokProvider()
        try:
            session = await provider._build_api_session(JobInput(
                prompt="", job_type="image", options=None,
                profile_path=probe_profile.profile_path,
            ))
        except Exception:  # noqa: BLE001
            session = None
        if session is not None:
            client, _pid, _tag = session
            # Same 15s hard timeout as /api/jobs/upload-input — without
            # it a stalled probe leaves API clients hanging until their
            # own request timeout, often interpreted as "service down".
            import asyncio as _asyncio
            try:
                await _asyncio.wait_for(
                    client.upload_file(
                        content=raw,
                        filename=file.filename or "input.png",
                        mime=file.content_type,
                    ),
                    timeout=15.0,
                )
            except _asyncio.TimeoutError:
                pass  # save without moderation check
            except GrokAPIError as exc:
                if exc.code == "content_moderated":
                    raise InvalidPayload(
                        "Ảnh vi phạm chính sách Grok (content moderation). "
                        "Đổi ảnh khác — không lưu, không tạo job.",
                    )
            except Exception:  # noqa: BLE001
                pass

    rec = await files_service.save_job_result(
        db,
        user_id=user.id,
        job_id=None,
        file_name=file.filename or "input.png",
        file_type="input",
        mime_type=file.content_type,
        data=raw,
    )
    await _bump_usage(db, api_key)
    await db.commit()
    return PublicUploadOut(
        file_id=rec.id,
        file_name=rec.file_name,
        mime_type=rec.mime_type or file.content_type,
        file_size=rec.file_size or len(raw),
    )


@router.post("/jobs/bulk-delete", response_model=PublicBulkDeleteOut)
async def bulk_delete_v1(
    payload: PublicBulkDeleteIn, principal: ApiKeyPrincipal, db: DbSession,
) -> PublicBulkDeleteOut:
    """Delete many jobs at once.

    Owner-only: each job_id must belong to the API key's user; jobs not
    owned end up in `skipped_not_owned`. In-flight rows (running /
    processing / uploading) are skipped — cancel them first. Caps at 500
    ids per request to keep the transaction bounded.
    """
    api_key, user = principal
    deleted = 0
    skipped_in_flight = 0
    skipped_not_owned = 0
    IN_FLIGHT = {"running", "processing_provider", "uploading_result"}
    for jid in payload.ids:
        j = await db.get(Job, jid)
        if j is None or j.user_id != user.id:
            skipped_not_owned += 1
            continue
        if j.status in IN_FLIGHT:
            skipped_in_flight += 1
            continue
        await db.delete(j)
        deleted += 1
    await _bump_usage(db, api_key)
    await db.commit()
    return PublicBulkDeleteOut(
        deleted=deleted,
        skipped_in_flight=skipped_in_flight,
        skipped_not_owned=skipped_not_owned,
    )


@router.get("/jobs/{job_id}", response_model=PublicJobOut)
async def get_job(job_id: uuid.UUID, principal: ApiKeyPrincipal, db: DbSession) -> PublicJobOut:
    _, user = principal
    job = await db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise NotFound("job")
    return PublicJobOut(
        job_id=job.id,
        status=job.status,
        result_url=job.result_url,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


@router.get("/jobs", response_model=list[PublicJobOut])
async def list_jobs(
    principal: ApiKeyPrincipal,
    db: DbSession,
    limit: int = Query(default=50, le=200),
) -> list[PublicJobOut]:
    _, user = principal
    result = await db.execute(
        select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc()).limit(limit)
    )
    jobs = list(result.scalars().all())
    return [
        PublicJobOut(
            job_id=j.id,
            status=j.status,
            result_url=j.result_url,
            error_message=j.error_message,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


@router.get("/files/{file_id}")
async def get_file_meta(file_id: uuid.UUID, principal: ApiKeyPrincipal, db: DbSession) -> dict:
    _, user = principal
    f = await db.get(File, file_id)
    if not f or f.user_id != user.id:
        raise NotFound("file")
    return {
        "id": str(f.id),
        "file_name": f.file_name,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "file_size": f.file_size,
        "url": f.public_url or f"/api/files/{f.id}/download",
    }
