"""/api/v1/gateway/uploads — multipart reference images / videos for clients."""

import secrets

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse

from app.core.deps import DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.modules.gateway.auth import GatewayCaller, require_caller
from app.modules.gateway.services.uploads import (
    ALLOWED_UPLOAD_EXTS,
    MAX_UPLOAD_BYTES,
    UPLOAD_DIR,
)

router = APIRouter()


@router.post("/uploads")
async def upload_reference(
    db: DbSession,
    file: UploadFile = File(...),
    caller: GatewayCaller = Depends(require_caller),
):
    """Accept a multipart file, store under storage/gateway-uploads, return
    a stable URL the playground (or client) can paste into reference_*_urls.
    """
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    if ext and ext not in ALLOWED_UPLOAD_EXTS:
        raise InvalidPayload(f"Extension {ext} không được phép. Cho phép: {sorted(ALLOWED_UPLOAD_EXTS)}")

    file_id = secrets.token_urlsafe(16).replace("-", "").replace("_", "")[:24]
    safe_name = f"{file_id}{ext}"
    path = UPLOAD_DIR / safe_name

    total = 0
    with path.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 64)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                f.close()
                path.unlink(missing_ok=True)
                raise InvalidPayload(f"File quá lớn (>{MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
            f.write(chunk)

    return {
        "filename": safe_name,
        "size": total,
        "url": f"/api/v1/gateway/uploads/{safe_name}",
    }


@router.get("/uploads/{filename}", response_model=None)
async def serve_upload(filename: str):
    """Serve a previously-uploaded reference back. Public — uploads have
    unguessable filenames already.
    """
    # Defence in depth — refuse anything with path separators.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise NotFound("file")
    path = UPLOAD_DIR / filename
    if not path.exists() or not path.is_file():
        raise NotFound("file")
    return FileResponse(path)
