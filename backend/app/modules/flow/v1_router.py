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

from fastapi.responses import FileResponse
from jose import JWTError, jwt

from app.core.config import settings
from app.core.deps import ApiKeyPrincipal, DbSession
from app.core.security import create_short_token
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


class V1JobsListResponse(BaseModel):
    """Wrapper for GET /jobs — matches plxeditor.com contract.

    plxeditor returns ``{jobs, total}`` so partners can paginate without
    a second count() call. studio-v2 mirrors that shape verbatim."""
    jobs: list[V1JobListItem]
    total: int


class V1JobDetail(BaseModel):
    """Full FlowJob shape for GET /jobs/{id} — matches plxeditor.com.

    Fields ordered to match the upstream OpenAPI schema exactly so
    partner integrations expecting a specific field set don't break."""
    id: uuid.UUID
    job_id: uuid.UUID  # duplicate of id, for clients that read either
    operation: str
    status: str
    progress: float
    error_message: str | None
    output_url: str | None
    output_filename: str | None
    output_duration: float | None
    file_size: int | None
    duration: float | None
    input_files: list | None
    params: dict | None
    has_audio: bool | None
    thumbnail_url: str | None
    message: str
    created_at: str | None
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

    # Reject .txt/binary/etc uploads at the door so ffmpeg never sees them.
    # Same rule as /api/flow/upload — see router.py:_validate_media_upload.
    from .router import _validate_media_upload
    for f in files:
        _validate_media_upload(f.filename or "", f.content_type, operation)

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

@router.get("/jobs/{job_id}", response_model=V1JobDetail)
async def get_job(
    job_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> V1JobDetail:
    """Full job detail — matches plxeditor.com /api/v1/video/jobs/{job_id}
    shape (15 fields including output_url, progress, input_files, params)."""
    _, user = principal
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(404, "job not found")
    duration_f = float(job.duration) if job.duration is not None else None
    return V1JobDetail(
        id=job.id,
        job_id=job.id,
        operation=job.operation,
        status=job.status,
        progress=float(job.progress) if job.progress is not None else 0.0,
        error_message=job.error_message,
        output_url=job.output_url,
        output_filename=job.output_filename,
        output_duration=duration_f,
        file_size=job.file_size,
        duration=duration_f,
        input_files=job.input_files,
        params=job.params,
        has_audio=None,
        thumbnail_url=None,
        message=job.error_message or f"job {job.status}",
        created_at=job.created_at.isoformat() if job.created_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


# ---------------------------------------------------------------- aliases + chunked-upload

@router.get("/status/{job_id}", response_model=V1JobDetail)
async def get_status(
    job_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> V1JobDetail:
    """Alias for /jobs/{job_id} — matches plxeditor.com's separate status surface."""
    return await get_job(job_id, principal, db)


@router.post("/jobs/{job_id}/retry", response_model=V1JobOut)
async def retry_job(
    job_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
    background: BackgroundTasks,
) -> V1JobOut:
    """Re-spawn the background processor for a failed/completed job with
    the same params. Mirrors /api/flow/jobs/{id}/retry (v0) under the
    public v1 namespace."""
    _, user = principal
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(404, "job not found")
    params = dict(job.params or {})
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
        db, user_id=user.id, action="flow_v1_retry",
        target_type="flow_job", target_id=job.id,
        metadata={"tool": job.operation},
    )
    await db.commit()
    await db.refresh(job)
    _spawn_task(background, job.operation, job.id, params)
    return _to_v1(job, message="Retrying job.")


@router.get("/download/{filename}")
async def download_output(filename: str, token: str | None = Query(default=None)) -> FileResponse:
    """Download a Flow output file. The output filename is itself an
    unguessable artefact key (`output/<job_id>_<op>_<rand>.mp4`) — token
    is accepted as belt-and-suspenders but not required if you already
    know the filename.

    Mirrors plxeditor.com's /api/v1/video/download/{filename}.
    """
    # service.output_file_path handles traversal sanity (rejects anything
    # without the <uuid>_<orig> naming convention).
    output_path = service.output_file_path(filename)
    if output_path is None:
        raise HTTPException(404, "file not found")
    # Token validation is optional (filename already secret) but accepted
    # for clients that want explicit auth check.
    if token:
        try:
            jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except JWTError:
            raise HTTPException(401, "invalid token")
    return FileResponse(
        output_path,
        filename=filename,
        media_type="application/octet-stream",
    )


class JobsInitIn(BaseModel):
    tool_name: str
    filenames: list[str]


class JobsInitOut(BaseModel):
    job_id: uuid.UUID
    upload_urls: list[str]
    object_keys: list[str]


def _make_upload_token(job_id: uuid.UUID, input_index: int) -> str:
    """Per-input upload token. Short-lived (60min) so a leaked URL
    can't be used to overwrite the input forever."""
    return create_short_token(
        subject=f"flow_upload:{job_id}:{input_index}",
        extra={
            "scope": "flow_upload",
            "job_id": str(job_id),
            "input_index": input_index,
        },
        minutes=60,
    )


def _validate_upload_token(token: str, job_id: uuid.UUID, input_index: int) -> bool:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return False
    return (
        payload.get("scope") == "flow_upload"
        and payload.get("job_id") == str(job_id)
        and payload.get("input_index") == input_index
    )


@router.post("/jobs/init", response_model=JobsInitOut)
async def init_job(
    payload: JobsInitIn,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> JobsInitOut:
    """Pre-create an empty job + return per-input upload URLs. Use for
    chunked / parallel uploads (large files, multiple inputs) — clients
    then PUT each file to /upload/{index}, optionally poll progress, and
    finally trigger processing via the op endpoint with job_id."""
    _, user = principal
    if payload.tool_name not in KNOWN_TOOLS:
        raise HTTPException(400, f"unknown tool: {payload.tool_name}")
    if not payload.filenames:
        raise HTTPException(400, "filenames is required")

    job_id = uuid.uuid4()
    input_files: list[dict] = []
    for i, fname in enumerate(payload.filenames):
        safe = _sanitize_filename(fname or f"input_{i}")
        input_files.append({
            "filename": safe,
            "object_key": f"{job_id}/{safe}",
            "uploaded": False,
        })
    # Pre-allocate dest dir so /upload/{idx} can write into it
    service.input_dir(job_id)
    job = FlowJob(
        id=job_id,
        user_id=user.id,
        operation=payload.tool_name,
        status="uploading",
        progress=Decimal("0"),
        input_files=input_files,
    )
    db.add(job)
    await audit.log_action(
        db, user_id=user.id, action="flow_v1_init",
        target_type="flow_job", target_id=job_id,
        metadata={"tool": payload.tool_name, "files": len(input_files)},
    )
    await db.commit()

    base = "/api/v1/video"
    upload_urls = [
        f"{base}/jobs/{job_id}/upload/{i}?token={_make_upload_token(job_id, i)}"
        for i in range(len(payload.filenames))
    ]
    return JobsInitOut(
        job_id=job_id,
        upload_urls=upload_urls,
        object_keys=[f["object_key"] for f in input_files],
    )


@router.put("/jobs/{job_id}/upload/{input_index}", response_model=V1JobOut)
async def upload_input(
    job_id: uuid.UUID,
    input_index: int,
    db: DbSession,
    file: UploadFile = File(...),
    token: str = Query(...),
) -> V1JobOut:
    """Upload a single input file to a pre-init'd job. Auth via per-input
    token (returned by /jobs/init) — does NOT require X-API-Key so the
    client can fan-out PUTs from a worker / browser without leaking the
    main key.
    """
    if not _validate_upload_token(token, job_id, input_index):
        raise HTTPException(401, "invalid upload token")
    job = (await db.execute(
        select(FlowJob).where(FlowJob.id == job_id)
    )).scalar_one_or_none()
    if not job:
        raise HTTPException(404, "job not found")
    if input_index >= len(job.input_files or []):
        raise HTTPException(400, "input_index out of range")

    slot = job.input_files[input_index]
    dest = service.input_dir(job_id) / slot["filename"]
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    # Mark slot uploaded — replace whole list so SQLAlchemy detects JSON change
    new_inputs = list(job.input_files)
    new_inputs[input_index] = {**slot, "uploaded": True}
    job.input_files = new_inputs
    if all(s.get("uploaded") for s in new_inputs):
        job.status = "pending"  # client can now trigger processing
    await db.commit()
    await db.refresh(job)
    return _to_v1(job, message=f"input {input_index} uploaded")


class UploadProgressIn(BaseModel):
    progress: int


@router.get("/jobs/{job_id}/upload-progress")
async def get_upload_progress(
    job_id: uuid.UUID,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> dict:
    """Aggregate progress across all input slots — % of slots that have
    been marked uploaded. Returns 100 when all uploads are done and the
    job is ready for processing."""
    _, user = principal
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(404, "job not found")
    inputs = job.input_files or []
    if not inputs:
        return {"job_id": str(job_id), "progress": 0}
    uploaded = sum(1 for s in inputs if s.get("uploaded"))
    return {"job_id": str(job_id), "progress": int(uploaded * 100 / len(inputs))}


@router.put("/jobs/{job_id}/upload-progress")
async def set_upload_progress(
    job_id: uuid.UUID,
    payload: UploadProgressIn,
    principal: ApiKeyPrincipal,
    db: DbSession,
) -> dict:
    """Client-reported progress hint. Stored on FlowJob.progress so the
    /jobs list reflects current upload state for big files where the
    server-side `uploaded` flag only flips when a slot finishes."""
    _, user = principal
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(404, "job not found")
    job.progress = Decimal(str(max(0, min(100, payload.progress))))
    await db.commit()
    return {"job_id": str(job_id), "progress": payload.progress}


@router.get("/jobs", response_model=V1JobsListResponse)
async def list_jobs(
    principal: ApiKeyPrincipal,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> V1JobsListResponse:
    """Paginated job list — matches plxeditor.com ``{jobs[], total}`` shape.

    `total` is the count of ALL jobs for the caller, regardless of
    skip/limit — clients use it to render "page N of M" without an
    extra count() round-trip.
    """
    from sqlalchemy import func
    _, user = principal
    total = (await db.execute(
        select(func.count(FlowJob.id)).where(FlowJob.user_id == user.id)
    )).scalar_one() or 0
    rows = (await db.execute(
        select(FlowJob).where(FlowJob.user_id == user.id)
        .order_by(FlowJob.created_at.desc())
        .offset(skip).limit(limit)
    )).scalars().all()
    return V1JobsListResponse(
        jobs=[
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
        ],
        total=int(total),
    )
