import uuid

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.models import File

from . import service

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{file_id}")
async def get_file_meta(file_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    f = await db.get(File, file_id)
    if not f:
        raise NotFound("file")
    if f.user_id != user.id and user.role != "admin":
        raise PermissionDenied()
    return {
        "id": str(f.id),
        "file_name": f.file_name,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "file_size": f.file_size,
        "download_url": f"/api/files/{f.id}/download",
    }


@router.get("/{file_id}/download")
async def download_file(file_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    f = await db.get(File, file_id)
    if not f:
        raise NotFound("file")
    if f.user_id != user.id and user.role != "admin":
        raise PermissionDenied()
    data = await service.read_file_bytes(f)
    return Response(
        content=data,
        media_type=f.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{f.file_name}"'},
    )
