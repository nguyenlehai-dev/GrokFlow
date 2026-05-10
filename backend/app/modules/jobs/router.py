import uuid

from fastapi import APIRouter, File as FastapiFile, Query, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import EntitlementBlocked, InvalidPayload, NotFound
from app.models import File, Job, JobLog
from app.modules.entitlements.service import (
    EntitlementDenied,
    assert_concurrent_jobs,
    assert_job_options,
    assert_quota,
    get_effective_entitlements,
)
from app.modules.files import service as files_service

from . import service
from .schemas import JobCreate, JobLogOut, JobOut, JobUpdate

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
    response: Response,
    status_filter: str | None = Query(default=None, alias="status"),
    provider: str | None = Query(default=None),
    job_type: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Search prompt substring"),
    limit: int = Query(default=20, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[Job]:
    """Paginated jobs list. Total count returned via X-Total-Count header so
    the frontend can render pagination controls without a 2nd request."""
    base = select(Job).where(Job.user_id == user.id)
    if status_filter:
        base = base.where(Job.status == status_filter)
    if provider:
        base = base.where(Job.provider == provider)
    if job_type:
        base = base.where(Job.job_type == job_type)
    if q:
        base = base.where(Job.prompt.ilike(f"%{q}%"))

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    stmt = base.order_by(Job.created_at.desc()).offset(offset).limit(limit)
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

    eff = await get_effective_entitlements(db, user)
    try:
        assert_job_options(
            eff,
            job_type=payload.job_type,
            has_input_image=payload.input_image_file_id is not None,
            options=options,
        )
        await assert_concurrent_jobs(db, user, eff)
        await assert_quota(db, user, eff)
    except EntitlementDenied as e:
        raise EntitlementBlocked(e.code, e.message)

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


@router.patch("/{job_id}", response_model=JobOut)
async def edit_job(
    job_id: uuid.UUID, payload: JobUpdate, user: CurrentUser, db: DbSession,
) -> Job:
    """Edit a job's prompt before it starts running. Only `pending` and
    `queued` jobs are editable — once the worker picks it up the prompt
    has already been submitted to Grok."""
    job = await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    if job.status not in {"pending", "queued"}:
        raise InvalidPayload(
            f"Chỉ sửa được job đang chờ (pending/queued). Job này đang {job.status}."
        )
    changed = []
    if payload.prompt is not None and payload.prompt != job.prompt:
        job.prompt = payload.prompt
        changed.append("prompt")
    if payload.options is not None:
        merged = dict(job.input_payload or {})
        merged.update(payload.options)
        job.input_payload = merged
        changed.append("options")
    if not changed:
        return job
    db.add(JobLog(job_id=job.id, level="info",
                  message=f"Job edited by user: {','.join(changed)}"))
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    """Delete a job permanently. Only terminal-status jobs can be deleted —
    in-flight jobs must be cancelled first to release their slot."""
    job = await service.assert_job_owner(db, job_id, user.id, user.role == "admin")
    if job.status in {"running", "processing_provider", "uploading_result"}:
        raise InvalidPayload(
            "Job đang chạy không thể xóa. Bấm Cancel trước rồi mới xóa được."
        )
    await db.delete(job)
    await db.commit()


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
