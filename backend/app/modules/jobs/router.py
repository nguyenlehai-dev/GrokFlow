import uuid

from fastapi import APIRouter, File as FastapiFile, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import InvalidPayload
from app.models import File, Job, JobLog
from app.modules.files import service as files_service

from . import service
from .schemas import JobCreate, JobLogOut, JobOut

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobInputUploadOut(BaseModel):
    file_id: uuid.UUID
    file_name: str
    mime_type: str
    file_size: int


@router.get("", response_model=list[JobOut])
async def list_jobs(
    user: CurrentUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
) -> list[Job]:
    stmt = select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc()).limit(limit)
    if status_filter:
        stmt = stmt.where(Job.status == status_filter)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobCreate, user: CurrentUser, db: DbSession) -> Job:
    options = dict(payload.options or {})
    if payload.size: options["size"] = payload.size
    if payload.model: options["model"] = payload.model
    if payload.style: options["style"] = payload.style
    if payload.n != 1: options["n"] = payload.n
    if payload.seed is not None: options["seed"] = payload.seed
    if payload.input_image_file_id: options["input_image_file_id"] = str(payload.input_image_file_id)

    return await service.create_job(
        db,
        user_id=user.id,
        provider=payload.provider,
        job_type=payload.job_type,
        prompt=payload.prompt,
        profile_id=payload.profile_id,
        options=options or None,
    )


@router.post("/upload-input", response_model=JobInputUploadOut, status_code=status.HTTP_201_CREATED)
async def upload_input(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = FastapiFile(...),
) -> JobInputUploadOut:
    """Upload a reference image for image-to-image / video jobs.

    Stored as a regular File record with file_type='input'. Returns file_id
    that you pass into POST /api/jobs as `input_image_file_id`.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise InvalidPayload("Only image/* uploads are accepted as input")
    raw = await file.read()
    if len(raw) > 20_000_000:
        raise InvalidPayload("Input image too large (>20MB)")
    rec = await files_service.save_job_result(
        db,
        user_id=user.id,
        job_id=None,  # detached upload — gets associated when used by a job
        file_name=file.filename or "input.png",
        file_type="input",
        mime_type=file.content_type,
        data=raw,
    )
    await db.commit()
    return JobInputUploadOut(
        file_id=rec.id,
        file_name=rec.file_name,
        mime_type=rec.mime_type or file.content_type,
        file_size=rec.file_size or len(raw),
    )


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Job:
    return await service.assert_job_owner(db, job_id, user.id, user.role == "admin")


@router.post("/{job_id}/retry", response_model=JobOut)
async def retry_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Job:
    job = await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    if job.status not in {"failed", "cancelled", "expired"}:
        raise InvalidPayload(f"Cannot retry job in status {job.status}")
    job.status = "queued"
    job.retry_count += 1
    # Manual retry should always proceed — bump the cap so the worker's
    # `retry_count < max_retry` filter doesn't immediately reject this job.
    if job.max_retry < job.retry_count:
        job.max_retry = job.retry_count + 1
    job.error_message = None
    job.next_attempt_at = None  # manual retry → immediately eligible
    job.completed_at = None
    db.add(JobLog(job_id=job.id, level="info",
                  message=f"Job retry requested (now {job.retry_count}/{job.max_retry})"))
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Job:
    job = await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    if job.status in {"success", "failed", "cancelled"}:
        raise InvalidPayload(f"Cannot cancel job in status {job.status}")
    job.status = "cancelled"
    db.add(JobLog(job_id=job.id, level="info", message="Job cancelled by user"))
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}/logs", response_model=list[JobLogOut])
async def get_job_logs(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[JobLog]:
    await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    result = await db.execute(select(JobLog).where(JobLog.job_id == job_id).order_by(JobLog.created_at))
    return list(result.scalars().all())


class JobFileOut(BaseModel):
    id: uuid.UUID
    file_name: str
    file_type: str
    mime_type: str | None
    file_size: int | None
    download_url: str


@router.get("/{job_id}/files", response_model=list[JobFileOut])
async def list_job_files(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[JobFileOut]:
    """Return all output files for this job (Grok may produce 1-4 image variations)."""
    await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    rows = (await db.execute(
        select(File).where(File.job_id == job_id, File.file_type != "input").order_by(File.created_at)
    )).scalars().all()
    return [
        JobFileOut(
            id=f.id,
            file_name=f.file_name,
            file_type=f.file_type,
            mime_type=f.mime_type,
            file_size=f.file_size,
            download_url=f"/api/files/{f.id}/download",
        ) for f in rows
    ]
