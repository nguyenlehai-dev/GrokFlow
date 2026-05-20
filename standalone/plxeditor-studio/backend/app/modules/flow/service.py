"""Flow video-processing — job lifecycle + per-tool FFmpeg recipes.

Each `process_*` function:
  1) marks the job `processing`,
  2) builds the FFmpeg argv for its tool,
  3) writes the output under `storage/flow/output/<job-id>/<filename>`,
  4) probes duration / size, marks the job `completed` (or `failed`).

Background execution uses FastAPI's BackgroundTasks (in-process). That
keeps the deployment simple — no separate worker container. Each task
opens its own DB session because BackgroundTasks runs after the request
session is closed.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import FlowJob
from app.modules.admin.notifications import service as notif

from .ffmpeg import FfmpegError, probe_duration, run_ffmpeg

logger = logging.getLogger(__name__)


# Process-level FFmpeg concurrency cap. Each FFmpeg encode peaks at ~600 MB
# RAM + one full vCPU; the backend container is capped at 1.5 GB and lives on
# a 2-vCPU VPS, so >2 concurrent encodes either OOMs or thrashes. We size
# this per-gunicorn-worker — with GUNICORN_WORKERS=2 and FLOW_MAX_CONCURRENT=1
# the system-wide ceiling is 2 simultaneous encodes, which is the sweet spot.
#
# Jobs over the cap stay in the "pending" state and queue here naturally
# (the semaphore.acquire blocks the BackgroundTasks thread until a slot
# frees). No external queue / Celery / Redis-stream needed.
_FFMPEG_SEM = threading.Semaphore(int(os.getenv("FLOW_MAX_CONCURRENT", "1")))


# ---------------------------------------------------------------------------
# Storage layout
# ---------------------------------------------------------------------------

def _root() -> Path:
    """Storage root for the flow module. Always under the GrokFlow shared
    storage volume so backups (restic) sweep it up with everything else."""
    p = Path(settings.LOCAL_STORAGE_PATH) / "flow"
    (p / "input").mkdir(parents=True, exist_ok=True)
    (p / "output").mkdir(parents=True, exist_ok=True)
    return p


def input_dir(job_id: uuid.UUID) -> Path:
    p = _root() / "input" / str(job_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def output_dir(job_id: uuid.UUID) -> Path:
    p = _root() / "output" / str(job_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def output_file_path(filename: str) -> Path | None:
    """Resolve a public output filename back to its on-disk path.

    Output files are named `<job_id>_<original>` so we can flatten the
    per-job dirs into one URL namespace without collisions. The job_id
    prefix also lets us reject path traversal cheaply (must be 36-char
    hex-with-dashes).
    """
    safe = Path(filename).name  # strip any path component
    if len(safe) < 37 or safe[36] != "_":
        return None
    job_id = safe[:36]
    on_disk = _root() / "output" / job_id / safe
    return on_disk if on_disk.exists() else None


# ---------------------------------------------------------------------------
# Job-state transitions
# ---------------------------------------------------------------------------

_sync_engine = None  # process-wide sync engine for BackgroundTasks


def _engine():
    """Lazy-init a sync SQLAlchemy engine. BackgroundTasks runs after the
    request session is closed and is plain-sync, so we need a separate
    engine from the async one the rest of the app uses. Singleton so we
    don't spin up a connection pool on every job-state transition."""
    global _sync_engine
    if _sync_engine is None:
        from sqlalchemy import create_engine

        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        # pool_pre_ping handles stale connections gracefully — important
        # because long FFmpeg runs can outlive Postgres's idle timeout.
        _sync_engine = create_engine(sync_url, future=True, pool_pre_ping=True)
    return _sync_engine


def _sync_update(job_id: uuid.UUID, **fields) -> None:
    """Synchronous job-row update used from BackgroundTasks."""
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    with Session(_engine()) as sess:
        sess.execute(update(FlowJob).where(FlowJob.id == job_id).values(**fields))
        sess.commit()


def _get_job_sync(job_id: uuid.UUID) -> FlowJob | None:
    from sqlalchemy.orm import Session

    with Session(_engine()) as sess:
        return sess.get(FlowJob, job_id)


def _resolve_inputs(job: FlowJob) -> list[Path]:
    """Map the saved `input_files[*].object_key` back to disk paths.
    Object keys are stored as `<job_id>/<filename>` relative to the input
    root — no scheme prefix, since we no longer support R2 here (kept the
    name `object_key` for FE-compat with the previous side-car shape)."""
    root = _root() / "input"
    paths = []
    for f in job.input_files or []:
        key = f.get("object_key", "")
        candidate = root / key
        if not candidate.exists():
            raise FfmpegError(f"input file missing: {key}")
        paths.append(candidate)
    return paths


def _publish_output(job: FlowJob, src: Path, ext: str = ".mp4") -> tuple[str, str, int]:
    """Move `src` into the public output dir, return (url, filename, size).
    The url is the same-origin path that nginx serves via /flow-output/."""
    out_name = f"{job.id}_{job.operation}{ext}"
    out_path = output_dir(job.id) / out_name
    shutil.move(str(src), str(out_path))
    size = out_path.stat().st_size
    return f"/flow-output/{out_name}", out_name, size


# ---------------------------------------------------------------------------
# Per-tool recipes
# ---------------------------------------------------------------------------

def _tmp(job_id: uuid.UUID, ext: str = ".mp4") -> Path:
    return output_dir(job_id) / f".tmp_{uuid.uuid4().hex[:8]}{ext}"


def _process(job_id: uuid.UUID, recipe) -> None:
    """Shared lifecycle wrapper.

    `recipe(inputs)` returns the temp output Path (still under the job's
    output dir but with a `.tmp_*` prefix so we can swap atomically once
    ffmpeg succeeds). Any FfmpegError → job marked failed; all other
    exceptions become "internal error".
    """
    started = time.time()
    job = _get_job_sync(job_id)
    if not job:
        logger.error("flow job %s vanished before processing", job_id)
        return

    # Block on the FFmpeg slot before flipping status to "processing" — that
    # way the FE sees the job correctly sitting in "pending" while queued
    # rather than a fake "processing" with 0% progress.
    with _FFMPEG_SEM:
        _sync_update(
            job_id,
            status="processing",
            progress=10,
            started_at=datetime.now(timezone.utc),
        )

        try:
            inputs = _resolve_inputs(job)
            tmp_out = recipe(inputs)
            # Probe BEFORE moving — the publish step renames the file out from
            # under us, and ffprobe is happy with either location anyway.
            media_seconds = probe_duration(tmp_out)
            url, fname, size = _publish_output(job, tmp_out, ext=tmp_out.suffix or ".mp4")
            _sync_update(
                job_id,
                status="completed",
                progress=100,
                output_url=url,
                output_filename=fname,
                file_size=size,
                duration=round(time.time() - started, 3),
                completed_at=datetime.now(timezone.utc),
                error_message=None,
            )
            notif.log_notification_sync(
                user_id=job.user_id, kind="flow_completed",
                title=f"Flow {job.operation} hoàn tất",
                body=f"Output: {fname} ({size // 1024} KB)",
                target_url="/flow/requests",
                severity="success",
            )
            try:
                shutil.rmtree(input_dir(job_id), ignore_errors=True)
            except Exception:  # noqa: BLE001
                pass
            _ = media_seconds  # currently unused — exposed via probe for future UI
        except FfmpegError as exc:
            logger.warning("flow %s failed: %s", job_id, exc)
            _sync_update(
                job_id,
                status="failed",
                error_message=str(exc),
                duration=round(time.time() - started, 3),
                completed_at=datetime.now(timezone.utc),
            )
            notif.log_notification_sync(
                user_id=job.user_id, kind="job_failed",
                title=f"Flow {job.operation} lỗi",
                body=str(exc)[:160],
                target_url="/flow/requests",
                severity="error",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("flow %s crashed", job_id)
            _sync_update(
                job_id,
                status="failed",
                error_message=f"internal error: {exc}",
                duration=round(time.time() - started, 3),
                completed_at=datetime.now(timezone.utc),
            )
            notif.log_notification_sync(
                user_id=job.user_id, kind="job_failed",
                title=f"Flow {job.operation} crash",
                body=f"internal error: {exc}",
                target_url="/flow/requests",
                severity="error",
            )


# Each tool's argv assembled inline — keeping them close together is easier
# to compare than splitting into a file per recipe. None of these are hot.

def process_cut(job_id: uuid.UUID, start_time: str, end_time: str) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".mp4")
        run_ffmpeg([
            "-ss", start_time,
            "-to", end_time,
            "-i", str(inputs[0]),
            "-c:v", "libx264", "-crf", "16", "-preset", "fast",
            "-c:a", "aac", "-b:a", "192k",
            "-avoid_negative_ts", "make_zero",
            str(out),
        ])
        return out
    _process(job_id, recipe)


def process_merge(job_id: uuid.UUID) -> None:
    def recipe(inputs: list[Path]) -> Path:
        # Build the concat manifest file demuxer expects.
        manifest = _tmp(job_id, ".txt")
        manifest.write_text("\n".join(f"file '{p}'" for p in inputs), encoding="utf-8")
        out = _tmp(job_id, ".mp4")
        run_ffmpeg([
            "-f", "concat", "-safe", "0",
            "-i", str(manifest),
            "-c", "copy",
            str(out),
        ])
        manifest.unlink(missing_ok=True)
        return out
    _process(job_id, recipe)


def process_extract_audio(job_id: uuid.UUID, audio_format: str = "mp3") -> None:
    def recipe(inputs: list[Path]) -> Path:
        ext = f".{audio_format}" if not audio_format.startswith(".") else audio_format
        codec = {"mp3": "libmp3lame", "wav": "pcm_s16le", "aac": "aac"}.get(audio_format, "libmp3lame")
        out = _tmp(job_id, ext)
        run_ffmpeg([
            "-i", str(inputs[0]),
            "-vn", "-acodec", codec,
            str(out),
        ])
        return out
    _process(job_id, recipe)


def process_add_audio(job_id: uuid.UUID, replace: bool) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".mp4")
        video, audio = inputs[0], inputs[1]
        if replace:
            # Replace audio track entirely.
            run_ffmpeg([
                "-i", str(video),
                "-i", str(audio),
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-map", "0:v:0", "-map", "1:a:0",
                "-shortest",
                str(out),
            ])
        else:
            # Mix audio streams together with amix filter.
            run_ffmpeg([
                "-i", str(video),
                "-i", str(audio),
                "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest[aout]",
                "-map", "0:v:0", "-map", "[aout]",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                str(out),
            ])
        return out
    _process(job_id, recipe)


def process_speed(job_id: uuid.UUID, speed: float, adjust_audio: bool = True) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".mp4")
        # setpts inverts the speed factor (2x video = 0.5 pts).
        vfilter = f"setpts={1/speed:.6f}*PTS"
        if adjust_audio:
            # atempo allows 0.5-2.0; for outside that range we'd chain
            # multiple atempo calls. 0.25-4 is the FE-enforced range so
            # we may need to compose for extreme values.
            if 0.5 <= speed <= 2.0:
                afilter = f"atempo={speed:.6f}"
            elif speed > 2.0:
                # 4× = 2.0 * 2.0; 3× ≈ 2.0 * 1.5; clamp to compose-able pairs.
                afilter = f"atempo=2.0,atempo={speed/2.0:.6f}"
            else:
                afilter = f"atempo=0.5,atempo={speed/0.5:.6f}"
            run_ffmpeg([
                "-i", str(inputs[0]),
                "-filter_complex", f"[0:v]{vfilter}[v];[0:a]{afilter}[a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                str(out),
            ])
        else:
            run_ffmpeg([
                "-i", str(inputs[0]),
                "-filter:v", vfilter,
                "-an",
                "-c:v", "libx264", "-crf", "18",
                str(out),
            ])
        return out
    _process(job_id, recipe)


def process_resize(
    job_id: uuid.UUID, width: int, height: int, maintain_aspect: bool = True,
) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".mp4")
        if maintain_aspect:
            # `force_original_aspect_ratio=decrease` keeps aspect, pads with
            # black bars to the requested canvas (`pad` filter).
            vf = (
                f"scale=w={width}:h={height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"
            )
        else:
            vf = f"scale={width}:{height}"
        run_ffmpeg([
            "-i", str(inputs[0]),
            "-vf", vf,
            "-c:v", "libx264", "-crf", "18",
            "-c:a", "copy",
            str(out),
        ])
        return out
    _process(job_id, recipe)


def process_crop(job_id: uuid.UUID, width: int, height: int, x: int, y: int) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".mp4")
        run_ffmpeg([
            "-i", str(inputs[0]),
            "-vf", f"crop={width}:{height}:{x}:{y}",
            "-c:v", "libx264", "-crf", "18",
            "-c:a", "copy",
            str(out),
        ])
        return out
    _process(job_id, recipe)


def process_extract_frames(
    job_id: uuid.UUID,
    first_frame: bool = False,
    last_frame: bool = False,
    timestamp: float | None = None,
) -> None:
    def recipe(inputs: list[Path]) -> Path:
        out = _tmp(job_id, ".png")
        if timestamp is not None:
            ts = f"{timestamp:.3f}"
            run_ffmpeg([
                "-ss", ts,
                "-i", str(inputs[0]),
                "-frames:v", "1",
                str(out),
            ])
        elif last_frame:
            dur = probe_duration(inputs[0]) or 0
            run_ffmpeg([
                "-sseof", "-0.5",
                "-i", str(inputs[0]),
                "-frames:v", "1",
                str(out),
            ])
            _ = dur  # noted but unused — sseof is more reliable than computing offset
        else:
            # Default: first frame.
            run_ffmpeg([
                "-i", str(inputs[0]),
                "-frames:v", "1",
                str(out),
            ])
        return out
    _process(job_id, recipe)


# ---------------------------------------------------------------------------
# Async-side ownership filter used by the router
# ---------------------------------------------------------------------------

async def get_user_job(db: AsyncSession, user_id: uuid.UUID, job_id: uuid.UUID) -> FlowJob | None:
    """Return the job iff it belongs to `user_id`. Returns None otherwise
    so the router can 404 instead of leaking existence."""
    job = (
        await db.execute(
            select(FlowJob).where(FlowJob.id == job_id, FlowJob.user_id == user_id),
        )
    ).scalar_one_or_none()
    return job
