"""Sidecar overlay for the video-processing-service.

Upstream hard-requires Cloudflare R2 for *both* input and output. We want to
run it on a VPS with `STORAGE_BACKEND=local` and no R2 credentials, so this
module:

  1) monkey-patches `video_service._process_job` to read inputs from a local
     directory when the storage backend is local
  2) adds a new endpoint `POST /api/v1/video/jobs/init-local` that accepts
     multipart files directly and stores them under `/app/data/input/<job_id>/`
  3) re-exports the upstream FastAPI app as `app` so uvicorn can run it
     unchanged (`uvicorn sidecar:app`)

Keep this file small — every behaviour added here is a divergence from
upstream and a future merge cost.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path
from typing import Callable

from fastapi import Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

logger = logging.getLogger("flow_api.sidecar")

# ---------------------------------------------------------------------------
# Import the upstream app first so all upstream modules are registered.
# After this line, monkey-patches we apply land before the first request.
# ---------------------------------------------------------------------------
from app.main import app  # noqa: E402  (must follow stdlib imports)
from app.api.deps import get_user_from_api_key  # noqa: E402
from app.db.session import SessionLocal, get_db  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import video_service  # noqa: E402
from app.services.storage_service import get_storage_backend  # noqa: E402

LOCAL_INPUT_ROOT = Path("/app/data/input")
LOCAL_INPUT_ROOT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 1) Patch _process_job so input keys starting with "local:" are read off
#    disk instead of pulled from R2. Keep the R2 path untouched so the
#    service still works in R2 mode if the user wires creds.
# ---------------------------------------------------------------------------
_orig_process_job = video_service._process_job


def _patched_process_job(
    job_id: str,
    input_keys: list[str],
    runner: Callable[[list[str]], tuple[bool, str, str | None]],
):
    is_local_batch = bool(input_keys) and all(
        isinstance(k, str) and k.startswith("local:") for k in input_keys
    )
    if not is_local_batch:
        return _orig_process_job(job_id, input_keys, runner)

    db = SessionLocal()
    started_at = time.time()
    output_path: str | None = None
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error("Job %s not found", job_id)
            return

        video_service._start_job(db, job)

        local_paths = []
        for key in input_keys:
            rel = key.replace("local:", "", 1)
            p = LOCAL_INPUT_ROOT / rel
            if not p.exists():
                video_service._fail_job(
                    db, job, f"Local input not found: {rel}", started_at
                )
                return
            local_paths.append(str(p))

        success, error, output_path = runner(local_paths)
        if not success or not output_path:
            video_service._fail_job(
                db, job, error or "Unknown processing error", started_at
            )
            return

        job.progress = 90.0
        db.commit()
        video_service._complete_job(db, job, output_path, started_at)
    except Exception as exc:  # noqa: BLE001
        logger.exception("local _process_job failed for %s", job_id)
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            video_service._fail_job(db, job, str(exc), started_at)
    finally:
        # In local mode we keep the input dir for retries — only cleanup output.
        if output_path:
            video_service._cleanup_files([output_path])
        db.close()


video_service._process_job = _patched_process_job


# Also stub out the R2 delete in _complete_job so it doesn't fail on local keys.
_orig_delete = None
try:
    from app.services import storage_service as _ss

    _orig_delete = _ss.delete_file_from_r2

    def _safe_delete(object_name: str) -> bool:
        if isinstance(object_name, str) and (
            object_name.startswith("local:") or object_name.startswith("input/")
        ):
            # Local keys live on disk under LOCAL_INPUT_ROOT — skip R2 delete.
            return True
        try:
            return _orig_delete(object_name)
        except Exception:  # noqa: BLE001
            # R2 not configured → silent no-op rather than crash the job tail.
            return False

    _ss.delete_file_from_r2 = _safe_delete
    video_service.delete_file_from_r2 = _safe_delete
except Exception:  # noqa: BLE001
    pass


# ---------------------------------------------------------------------------
# 2) Direct-upload endpoint. FE posts multipart `files=...` (1 or more) plus
#    `tool_name`. We persist each file to /app/data/input/<job_id>/<name>,
#    create the Job row with input_files pointing at "local:<job_id>/<name>",
#    and return the job_id. FE then calls /api/v1/video/<tool> with that ID.
# ---------------------------------------------------------------------------
@app.post("/api/v1/video/jobs/init-local", tags=["Video Processing"])
async def init_local_upload_job(
    tool_name: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_user_from_api_key),
):
    if get_storage_backend() != "local":
        # Force callers to use the upstream presigned-URL path when R2 is on.
        raise HTTPException(
            status_code=400,
            detail="STORAGE_BACKEND is not local — use POST /jobs/init with presigned URLs.",
        )
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    job_id = str(uuid.uuid4())
    job_dir = LOCAL_INPUT_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    input_files = []
    for f in files:
        # Sanitize filename — strip any path component, keep extension.
        safe_name = os.path.basename(f.filename or "upload.bin").replace("..", "_")
        dest = job_dir / safe_name
        with dest.open("wb") as out:
            while chunk := await f.read(1024 * 1024):
                out.write(chunk)
        input_files.append(
            {
                "filename": safe_name,
                "object_key": f"local:{job_id}/{safe_name}",
            }
        )

    job = Job(
        id=job_id,
        operation=tool_name,
        status="uploading",
        progress=100.0,  # local upload is "done" the moment we return
        user_id=user.id,
        input_files=input_files,
    )
    db.add(job)
    db.commit()

    return {
        "job_id": job_id,
        "input_files": input_files,
        "backend": "local",
    }
