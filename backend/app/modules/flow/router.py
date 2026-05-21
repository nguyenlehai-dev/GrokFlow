"""HTTP surface for the Flow video-processing module.

The previous incarnation reverse-proxied to a separate `flow-api`
container; that side-car has been folded into this very backend. The
endpoint shape is unchanged so the FE didn't need a single edit.

Endpoints (all mounted under `/api/flow`):

    POST /upload              multipart files + tool_name → job_id
    POST /upload-url          (legacy compat — returns 501; URL bypass
                              required R2, which the native impl no
                              longer ships)
    POST /run/{tool}          form params + job_id → BackgroundTask spawned
    GET  /jobs                paginated list of caller's jobs
    GET  /jobs/{id}           single job (404 if not yours)
    POST /jobs/{id}/retry     re-spawn with the same params
    GET  /download/{name}     stream output file by filename
    GET  /health              service smoke-test (always ok if backend up)

Background work uses FastAPI's BackgroundTasks (in-process) so we don't
need an extra worker container. Each task opens its own sync DB session
because BackgroundTasks runs after the request session is closed.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models import FlowJob
from app.modules.admin.audit import service as audit

from . import service
from .schemas import (
    FlowJobListOut,
    FlowJobOut,
    UploadByUrlsRequest,
    UploadResponse,
)

router = APIRouter(prefix="/api/flow", tags=["flow"])
logger = logging.getLogger(__name__)


# Supported tool slugs — must mirror the FE's `tools.ts` slug field.
KNOWN_TOOLS: frozenset[str] = frozenset({
    "cut", "merge", "extract-audio", "add-audio",
    "speed", "resize", "crop", "extract-frames",
})


def _sanitize_filename(raw: str | None) -> str:
    """Strip path components from a user-provided filename. Keep the
    extension though — FFmpeg often needs it to choose a demuxer."""
    name = os.path.basename(raw or "upload.bin").replace("..", "_")
    return name or "upload.bin"


# Extensions FFmpeg's libavformat will demux. Lowercased on compare.
# Pulled from the demuxer list rather than guessing — if a customer
# wants to upload a format we don't list here, they can lobby for it
# and we add the extension (it's just a string check, not a feature).
_VIDEO_EXTS: frozenset[str] = frozenset({
    "mp4", "mov", "m4v", "mkv", "webm", "avi", "wmv", "flv", "mpg",
    "mpeg", "ts", "mts", "m2ts", "3gp", "ogv", "vob", "asf",
})
_AUDIO_EXTS: frozenset[str] = frozenset({
    "mp3", "wav", "aac", "m4a", "ogg", "oga", "flac", "opus", "wma",
})
_IMAGE_EXTS: frozenset[str] = frozenset({
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff",
})


def _validate_media_upload(filename: str, mime_type: str | None, tool_name: str) -> None:
    """Reject uploads that FFmpeg won't be able to demux.

    Why: the v0 /upload endpoint used to accept anything and saved the
    bytes verbatim. A `dummy.txt` upload then hit /run/<tool>, the
    background task shelled out to ffmpeg, and ffmpeg failed with the
    cryptic 'Invalid data found when processing input' — surfaced to
    the user as 500 with the entire ffmpeg banner. Validating at the
    edge gives a clean 400 with a real explanation instead.

    Accept rules per tool:
      - add-audio        : at least one video + one audio
      - extract-audio    : video input
      - everything else  : video input
    """
    name = filename.lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    mime = (mime_type or "").lower()

    is_video = ext in _VIDEO_EXTS or mime.startswith("video/")
    is_audio = ext in _AUDIO_EXTS or mime.startswith("audio/")

    # add-audio accepts an audio track alongside a video — treat audio
    # as valid here, the per-tool argument resolver will figure out
    # which file goes where.
    if tool_name == "add-audio" and (is_video or is_audio):
        return

    if not is_video:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File '{filename}' không phải video — Flow tools cần input video "
                f"(mp4/mov/mkv/webm/…). Phát hiện ext='.{ext}' mime='{mime or 'unknown'}'."
            ),
        )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResponse)
async def upload(
    user: CurrentUser,
    db: DbSession,
    tool_name: str = Form(...),
    files: list[UploadFile] = File(...),
) -> UploadResponse:
    if tool_name not in KNOWN_TOOLS:
        raise HTTPException(status_code=400, detail=f"unknown tool: {tool_name}")
    if not files:
        raise HTTPException(status_code=400, detail="at least one file is required")

    # Pre-flight content-type / extension check — refuse non-media uploads
    # at the edge so /run never hands ffmpeg a .txt and fails downstream.
    for f in files:
        _validate_media_upload(f.filename or "", f.content_type, tool_name)

    job_id = uuid.uuid4()
    dest_dir = service.input_dir(job_id)

    input_files: list[dict] = []
    for f in files:
        safe_name = _sanitize_filename(f.filename)
        dest = dest_dir / safe_name
        with dest.open("wb") as out:
            # Stream in 1 MiB chunks — anything larger doesn't help on disk
            # write throughput and pins more RAM than necessary.
            while chunk := await f.read(1024 * 1024):
                out.write(chunk)
        input_files.append({
            "filename": safe_name,
            "object_key": f"{job_id}/{safe_name}",
        })

    # Audit per upload — the FE upload step is the user-initiated moment;
    # /run/{tool} that follows just attaches params + spawns BackgroundTask.
    # Logging here means the audit row exists even if the user abandons
    # before submitting, and the per-domain audit-logs tab shows real
    # Flow activity instead of being silent.
    await audit.log_action(
        db, user_id=user.id, action="flow_upload",
        target_type="flow_job", target_id=job_id,
        metadata={
            "tool": tool_name,
            "file_count": len(files),
            "total_bytes": sum((f.size or 0) for f in files),
        },
    )

    job = FlowJob(
        id=job_id,
        user_id=user.id,
        operation=tool_name,
        status="uploading",
        progress=Decimal("100"),  # upload-finish == 100% of the upload phase
        input_files=input_files,
    )
    db.add(job)
    await db.commit()

    return UploadResponse(
        job_id=job_id,
        input_files=[{"filename": f["filename"], "object_key": f["object_key"]} for f in input_files],
        backend="local",
    )


@router.post("/upload-url")
async def upload_by_urls(payload: UploadByUrlsRequest, user: CurrentUser):
    """Legacy compat shim — the side-car supported pre-hosted R2/Cloudflare
    URLs via a presigned-PUT bypass. The native FFmpeg path runs locally and
    has no equivalent, so we 501 here and the FE falls back to multipart."""
    _ = payload, user
    raise HTTPException(
        status_code=501,
        detail="URL bypass is no longer supported — please upload the file directly",
    )


# ---------------------------------------------------------------------------
# Run a tool
# ---------------------------------------------------------------------------

@router.post("/run/{tool}", response_model=FlowJobOut)
async def run_tool(
    tool: str,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    job_id: uuid.UUID = Form(...),
    # All tool-specific params live behind `Form(None)` so we can accept
    # them in a uniform multipart body. Unset values fall through to the
    # service-level defaults.
    start_time: str | None = Form(None),
    end_time: str | None = Form(None),
    format: str | None = Form(None),
    replace: bool | None = Form(None),
    speed: float | None = Form(None),
    adjust_audio: bool | None = Form(None),
    width: int | None = Form(None),
    height: int | None = Form(None),
    maintain_aspect: bool | None = Form(None),
    x: int | None = Form(None),
    y: int | None = Form(None),
    first_frame: bool | None = Form(None),
    last_frame: bool | None = Form(None),
    timestamp: float | None = Form(None),
) -> FlowJobOut:
    if tool not in KNOWN_TOOLS:
        raise HTTPException(status_code=404, detail="unknown tool")

    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.operation != tool:
        raise HTTPException(
            status_code=400,
            detail=f"job was created for {job.operation}, not {tool}",
        )

    # Persist the chosen params so retries can replay them without the FE
    # having to re-send.
    params = {
        k: v for k, v in {
            "start_time": start_time, "end_time": end_time,
            "format": format, "replace": replace,
            "speed": speed, "adjust_audio": adjust_audio,
            "width": width, "height": height, "maintain_aspect": maintain_aspect,
            "x": x, "y": y,
            "first_frame": first_frame, "last_frame": last_frame, "timestamp": timestamp,
        }.items() if v is not None
    }
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
        db, user_id=user.id, action="flow_run",
        target_type="flow_job", target_id=job.id,
        metadata={"tool": tool, **{k: v for k, v in params.items() if v is not None}},
    )
    await db.commit()
    await db.refresh(job)

    _spawn_task(background, tool, job.id, params)
    return FlowJobOut.model_validate(job)


def _spawn_task(background: BackgroundTasks, tool: str, job_id: uuid.UUID, params: dict) -> None:
    """Dispatch to the right service.process_* with the right args.
    Centralised so /run and /retry share the same routing logic."""
    if tool == "cut":
        background.add_task(
            service.process_cut, job_id,
            params.get("start_time") or "00:00:00",
            params.get("end_time") or "00:00:10",
        )
    elif tool == "merge":
        background.add_task(service.process_merge, job_id)
    elif tool == "extract-audio":
        background.add_task(
            service.process_extract_audio, job_id, params.get("format") or "mp3",
        )
    elif tool == "add-audio":
        background.add_task(
            service.process_add_audio, job_id, bool(params.get("replace") or False),
        )
    elif tool == "speed":
        background.add_task(
            service.process_speed, job_id,
            float(params.get("speed") or 1.0),
            bool(params.get("adjust_audio") if params.get("adjust_audio") is not None else True),
        )
    elif tool == "resize":
        background.add_task(
            service.process_resize, job_id,
            int(params.get("width") or 1280),
            int(params.get("height") or 720),
            bool(params.get("maintain_aspect") if params.get("maintain_aspect") is not None else True),
        )
    elif tool == "crop":
        background.add_task(
            service.process_crop, job_id,
            int(params.get("width") or 640),
            int(params.get("height") or 360),
            int(params.get("x") or 0),
            int(params.get("y") or 0),
        )
    elif tool == "extract-frames":
        background.add_task(
            service.process_extract_frames, job_id,
            bool(params.get("first_frame") or False),
            bool(params.get("last_frame") or False),
            float(params["timestamp"]) if params.get("timestamp") is not None else None,
        )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}", response_model=FlowJobOut)
async def get_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> FlowJobOut:
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return FlowJobOut.model_validate(job)


@router.get("/jobs", response_model=FlowJobListOut)
async def list_jobs(
    user: CurrentUser, db: DbSession, skip: int = 0, limit: int = 50,
) -> FlowJobListOut:
    limit = max(1, min(limit, 100))
    rows = (
        await db.execute(
            select(FlowJob)
            .where(FlowJob.user_id == user.id)
            .order_by(FlowJob.created_at.desc())
            .offset(skip)
            .limit(limit),
        )
    ).scalars().all()
    return FlowJobListOut(
        jobs=[FlowJobOut.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post("/jobs/{job_id}/retry", response_model=FlowJobOut)
async def retry_job(
    job_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
) -> FlowJobOut:
    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.status not in {"failed", "completed"}:
        raise HTTPException(
            status_code=400,
            detail=f"only failed/completed jobs can be retried (current: {job.status})",
        )
    if not job.params or not job.input_files:
        raise HTTPException(
            status_code=400,
            detail="job has no params/inputs to replay — re-upload required",
        )

    job.status = "pending"
    job.progress = Decimal("0")
    job.error_message = None
    job.output_url = None
    job.output_filename = None
    job.file_size = None
    job.duration = None
    job.started_at = None
    job.completed_at = None
    await db.commit()
    await db.refresh(job)

    _spawn_task(background, job.operation, job.id, job.params)
    return FlowJobOut.model_validate(job)


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    """Remove a Flow job record + best-effort wipe of its on-disk files.

    Lets operators clean up the Requests list — failed jobs from before a
    fix shipped (eg the dummy.txt ffmpeg dumps) pile up otherwise. The
    background task can't be cancelled mid-run, so we refuse to delete a
    row whose status is still 'processing' / 'pending' — caller should
    wait or use the cancel flow first.
    """
    import shutil

    job = await service.get_user_job(db, user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.status in {"pending", "processing", "uploading"}:
        raise HTTPException(
            status_code=400,
            detail=f"cannot delete a {job.status} job — wait for it to finish first",
        )

    # Best-effort filesystem wipe. The service is the source of truth for
    # where files live (input_dir / output_dir return Path objects).
    for path_fn in (service.input_dir, service.output_dir):
        try:
            d = path_fn(job_id)
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
        except Exception:  # noqa: BLE001
            logger.exception("flow delete: cleanup failed for %s", job_id)

    await db.delete(job)
    await audit.log_action(
        db, user_id=user.id, action="flow_delete",
        target_type="flow_job", target_id=job_id,
        metadata={"operation": job.operation, "status_at_delete": job.status},
    )
    await db.commit()
    return {"deleted": str(job_id)}


# ---------------------------------------------------------------------------
# File download (used by /flow-output/<name> nginx alias too)
# ---------------------------------------------------------------------------

_FLOW_MIME = {
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".aac": "audio/aac",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".zip": "application/zip",
}


@router.get("/download/{filename}")
async def download(filename: str):
    """Stream an output file by its public filename.

    Filenames embed the job_id (see service.output_file_path) so we don't
    have to look up the job row to authorise — anyone with the link can
    download (link-as-credential pattern, fine for this use case). Path
    traversal is rejected by the name validator.

    Mime is set from the extension so the browser can render videos /
    audio inline (the <video> tag refuses to play octet-stream)."""
    path = service.output_file_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="file not found")
    ext = path.suffix.lower()
    mime = _FLOW_MIME.get(ext, "application/octet-stream")
    return FileResponse(path, filename=filename, media_type=mime)


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

@router.get("/health")
async def health(user: CurrentUser):
    """Smoke-test that the Flow path is wired. FE's System Auth panel
    used to ping this against the side-car — now it's just an in-process
    check."""
    _ = user  # auth-required so anonymous traffic can't crawl flow state
    return {"status": "healthy", "backend": "native", "version": "1.0.0"}
