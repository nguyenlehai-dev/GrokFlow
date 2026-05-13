import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import ApiKeyPrincipal, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.core.rate_limit import enforce_api_key_rate_limit
from app.models import File, Job
from app.modules.admin.audit import service as audit
from app.modules.grok.jobs import service as job_service

router = APIRouter(prefix="/v1", tags=["public-v1"])


class PublicJobCreate(BaseModel):
    provider: str = Field(pattern="^(grok|flow)$")
    profile_id: uuid.UUID | None = None
    prompt: str = Field(min_length=1, max_length=4000)
    options: dict[str, Any] | None = None


class PublicJobAck(BaseModel):
    job_id: uuid.UUID
    status: str
    message: str = "Job đã được đưa vào hàng đợi."


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
        options=payload.options,
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
        options=payload.options,
        api_key_id=api_key.id,
    )
    await _bump_usage(db, api_key)
    await audit.log_action(db, user_id=user.id, action="create_job", target_type="job", target_id=job.id,
                           metadata={"provider": payload.provider, "job_type": "video", "via": "public_v1"})
    await db.commit()
    return PublicJobAck(job_id=job.id, status=job.status)


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
