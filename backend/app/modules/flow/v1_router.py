"""Flow v1 public API — per-operation endpoints under /api/v1/video/*.

Matches the documented spec at /flow/api-docs:

    POST /api/v1/video/cut            start_time, end_time
    POST /api/v1/video/merge          multiple videos
    POST /api/v1/video/add-audio      replace flag
    POST /api/v1/video/crop           width, height, x, y
    POST /api/v1/video/extract-audio  format
    POST /api/v1/video/speed          speed, adjust_audio
    POST /api/v1/video/resize         width, height, maintain_aspect
    POST /api/v1/video/extract-frames first_frame, last_frame, timestamp
    GET  /api/v1/video/jobs
    GET  /api/v1/video/jobs/{id}

Auth: ``X-API-Key: <key>`` (Bearer also accepted — see app.core.deps.
get_api_key_principal). Returns a v1 response envelope rather than the
internal FlowJob shape so partners can rely on a stable contract:

    {
        "job_id": "<uuid>",
        "status": "pending|processing|completed|failed",
        "message": str,
        "thumbnail_url": str | None,
        "has_audio": bool | None,
        "output_duration": float | None
    }

The underlying processing reuses the existing ``service.process_*``
functions (BackgroundTasks dispatched from the original /run/{tool}
endpoint), so v1 and v0 share the same workers / DB rows.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import ApiKeyPrincipal, DbSession
from app.models import FlowJob
from app.modules.admin.audit import service as audit

from . import service
from .router import KNOWN_TOOLS, _sanitize_filename, _spawn_task

router = APIRouter(prefix="/api/v1/video", tags=["video v1"])


# --------------------------------------------------------------- response shape

class V1JobOut(BaseModel):
    """Public partner-facing envelope. KEEP STABLE — frozen contract."""
    job_id: uuid.UUID
    status: str
    message: str
    thumbnail_url: str | None = None
    has_audio: bool | None = None
    output_duration: float | None = None


class V1JobListItem(BaseModel):
    id: uuid.UUID
    operation: str
    status: str
    progress: float
    error_message: str | None
    output_url: str | None
    created_at: str
    completed_at: str | None


def _to_v1(job: FlowJob, *, message: str = "Processing job queued.") -> V1JobOut:
    return V1JobOut(
        job_id=job.id,
        status=job.status,
        message=message,
        thumbnail_url=None,
        has_audio=None,
        output_duration=float(job.duration) if job.duration is not None else None,
    )


# --------------------------------------------------------------- input helpers

async def _materialize_input(
    db,
    user_id: uuid.UUID,
    operation: str,
    video: UploadFile | None,
    video_url: str | None,
    job_id_in: uuid.UUID | None,
    extra_files: list[UploadFile] | None = None,
) -> FlowJob:
    """Resolve the 3 input modes (file upload / video URL / existing job_id)
    into a FlowJob row. Mirrors the v0 /upload + /run two-step but folds
    them into one call for the partner-facing API.
    """
    # Mode 3: existing job_id — caller already uploaded earlier
    if job_id_in is not None:
        job = await service.get_user_job(db, user_id, job_id_in)
        if not job:
            raise HTTPException(404, "job not found")
        if job.operation != operation:
            raise HTTPException(400, f"job was created for {job.operation}, not {operation}")
        return job

    # Mode 2: video URL — only one URL supported for now (no /upload-url native)
    if video_url:
        raise HTTPException(
            501,
            "video_url is not yet supported on this deployment — "
            "please upload the file as `video` multipart instead",
        )

    # Mode 1: file upload (default)
    if video is None and not extra_files:
        raise HTTPException(400, "one of `video`, `video_url`, or `job_id` is required")

    files = [video] if video else []
    if extra_files:
        files.extend([f for f in extra_files if f is not None])
    if not files:
        raise HTTPException(400, "at least one video file is required")

    job_id = uuid.uuid4()
    dest_dir = service.input_dir(job_id)
    input_files: list[dict] = []
    for f in files:
        safe_name = _sanitize_filename(f.filename or "input")
        dest = dest_dir / safe_name
        with dest.open("wb") as out:
            while chunk := await f.read(1024 * 1024):
                out.write(chunk)
        input_files.append({
            "filename": safe_name,
            "object_key": f"{job_id}/{safe_name}",
        })

    job = FlowJob(
        id=job_id,
        user_id=user_id,
        operation=operation,
        status="pending",
        progress=Decimal("0"),
        input_files=input_files,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def _kickoff(
    db,
    background: BackgroundTasks,
    user_id: uuid.UUID,
    operation: str,
    job: FlowJob,
    params: dict,
) -> FlowJob:
    """Persist params + spawn the background processor + audit-log."""
    job.params = params
    job.status = "pending"
    job.progress = Decimal("0")
    job.error_message = None
    job.output_url = None
    job.output_filename = None
    job.file_size = None
    job.duration = None
    job.started_at = None
    job.completed_at = None
    await audit.log_action(
        db, user_id=user_id, action="flow_v1_run",
        target_type="flow_job", target_id=job.id,
        metadata={"tool": operation, **{k: v for k, v in params.items() if v is not None}},
    )
    await db.commit()
    await db.refresh(job)
    _spawn_task(background, operation, job.id, params)
    return job


# ---------------------------------------------------------------- endpoints

@router.post("/cut", response_model=V1JobOut)
async def cut_video(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    start_time: str = Form("00:00:00"),
    end_time: str = Form("00:00:10"),
) -> V1JobOut:
    _, user = principal
    job = await _materialize_input(db, user.id, "cut", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "cut", job,
                          {"start_time": start_time, "end_time": end_time})
    return _to_v1(job)


@router.post("/merge", response_model=V1JobOut)
async def merge_videos(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    videos: list[UploadFile] = File(default_factory=list),
    video_urls: list[str] = Form(default_factory=list),
    job_id: uuid.UUID | None = Form(None),
) -> V1JobOut:
    _, user = principal
    if video_urls:
        raise HTTPException(501, "video_urls not yet supported — upload as multipart `videos`")
    job = await _materialize_input(
        db, user.id, "merge",
        video=None, video_url=None, job_id_in=job_id,
        extra_files=videos,
    )
    job = await _kickoff(db, background, user.id, "merge", job, {})
    return _to_v1(job)


@router.post("/add-audio", response_model=V1JobOut)
async def add_audio(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile = File(...),
    audio: UploadFile | None = File(None),
    audio_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    replace: bool = Form(False),
) -> V1JobOut:
    _, user = principal
    if audio_url:
        raise HTTPException(501, "audio_url not supported — upload as multipart `audio`")
    extras = [audio] if audio else []
    job = await _materialize_input(
        db, user.id, "add-audio",
        video=video, video_url=None, job_id_in=job_id, extra_files=extras,
    )
    job = await _kickoff(db, background, user.id, "add-audio", job, {"replace": replace})
    return _to_v1(job)


@router.post("/crop", response_model=V1JobOut)
async def crop_video(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    width: int = Form(...),
    height: int = Form(...),
    x: int = Form(0),
    y: int = Form(0),
) -> V1JobOut:
    _, user = principal
    job = await _materialize_input(db, user.id, "crop", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "crop", job,
                          {"width": width, "height": height, "x": x, "y": y})
    return _to_v1(job)


@router.post("/extract-audio", response_model=V1JobOut)
async def extract_audio(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    format: str = Form("mp3"),
) -> V1JobOut:
    _, user = principal
    job = await _materialize_input(db, user.id, "extract-audio", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "extract-audio", job, {"format": format})
    return _to_v1(job)


@router.post("/speed", response_model=V1JobOut)
async def change_speed(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    speed: float = Form(...),
    adjust_audio: bool = Form(True),
) -> V1JobOut:
    _, user = principal
    if not (0.25 <= speed <= 4.0):
        raise HTTPException(400, "speed must be between 0.25 and 4.0")
    job = await _materialize_input(db, user.id, "speed", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "speed", job,
                          {"speed": speed, "adjust_audio": adjust_audio})
    return _to_v1(job)


@router.post("/resize", response_model=V1JobOut)
async def resize_video(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    width: int = Form(...),
    height: int = Form(...),
    maintain_aspect: bool = Form(True),
) -> V1JobOut:
    _, user = principal
    job = await _materialize_input(db, user.id, "resize", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "resize", job,
                          {"width": width, "height": height, "maintain_aspect": maintain_aspect})
    return _to_v1(job)


@router.post("/extract-frames", response_model=V1JobOut)
async def extract_frames(
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
    video: UploadFile | None = File(None),
    video_url: str | None = Form(None),
    job_id: uuid.UUID | None = Form(None),
    first_frame: bool = Form(False),
    last_frame: bool = Form(False),
    timestamp: float | None = Form(None),
) -> V1JobOut:
    _, user = principal
    if not (first_frame or last_frame or timestamp is not None):
        raise HTTPException(400, "at least one of first_frame / last_frame / timestamp is required")
    job = await _materialize_input(db, user.id, "extract-frames", video, video_url, job_id)
    job = await _kickoff(db, background, user.id, "extract-frames", job,
                          {"first_frame": first_frame, "last_frame": last_frame, "timestamp": timestamp})
    return _to_v1(job)


# ---------------------------------------------------------------- reads

@router.get("/jobs/{job_id}", response_model=V1JobOut)
async def get_job(
    job_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> V1JobOut:
    _, user = principal
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return V1JobOut(
        job_id=job.id,
        status=job.status,
        message=job.error_message or f"job {job.status}",
        thumbnail_url=None,
        has_audio=None,
        output_duration=float(job.duration) if job.duration is not None else None,
    )


@router.get("/jobs", response_model=list[V1JobListItem])
async def list_jobs(
    principal: ApiKeyPrincipal,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[V1JobListItem]:
    _, user = principal
    rows = (await db.execute(
        select(FlowJob).where(FlowJob.user_id == user.id)
        .order_by(FlowJob.created_at.desc())
        .offset(skip).limit(limit)
    )).scalars().all()
    return [
        V1JobListItem(
            id=j.id,
            operation=j.operation,
            status=j.status,
            progress=float(j.progress) if j.progress is not None else 0.0,
            error_message=j.error_message,
            output_url=j.output_url,
            created_at=j.created_at.isoformat() if j.created_at else "",
            completed_at=j.completed_at.isoformat() if j.completed_at else None,
        )
        for j in rows
    ]
