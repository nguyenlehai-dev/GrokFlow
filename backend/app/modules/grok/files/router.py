import uuid

from fastapi import APIRouter, Header, Query
from fastapi.responses import Response
from jose import JWTError, jwt

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.core.security import create_short_token
from app.models import File, User

from . import service

router = APIRouter(prefix="/api/files", tags=["files"])


# Admin family: tenant admins and super_admin can read everyone's files
# in their scope. The legacy check rejected super_admin (role != "admin")
# which also silently broke the gallery on /api/files/.../download.
_ADMIN_ROLES = {"admin", "super_admin"}


def _can_read(user: User, file_owner_id: uuid.UUID) -> bool:
    return user.id == file_owner_id or user.role in _ADMIN_ROLES


@router.get("/{file_id}")
async def get_file_meta(file_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    f = await db.get(File, file_id)
    if not f:
        raise NotFound("file")
    if not _can_read(user, f.user_id):
        raise PermissionDenied()
    return {
        "id": str(f.id),
        "file_name": f.file_name,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "file_size": f.file_size,
        "download_url": f"/api/files/{f.id}/download",
    }


def make_share_token(file_id: uuid.UUID, minutes: int = 60 * 24) -> str:
    """Short-lived JWT that authorises a single file download.

    Embedded as `?token=...` on inline media URLs (gallery cells, preview
    modal). Lets <img>/<video> tags hit /download without sending an
    Authorization header.
    """
    return create_short_token(
        subject=f"file:{file_id}",
        extra={"file_id": str(file_id), "scope": "file_download"},
        minutes=minutes,
    )


def _validate_share_token(token: str, file_id: uuid.UUID) -> bool:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return False
    return payload.get("file_id") == str(file_id) and payload.get("scope") == "file_download"


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    db: DbSession,
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> Response:
    """Inline-friendly download. Auth via either:
      - `Authorization: Bearer <jwt>` (programmatic / fetch())
      - `?token=<short-lived share token>` (browser <img>/<video> tags)
    """
    f = await db.get(File, file_id)
    if not f:
        raise NotFound("file")

    authorized = False
    if token and _validate_share_token(token, file_id):
        authorized = True
    elif authorization and authorization.lower().startswith("bearer "):
        # Resolve the JWT manually so we don't depend on the FastAPI dep
        # wrapper (Bearer + share-token paths share one handler).
        bearer = authorization.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(bearer, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            sub = payload.get("sub")
            if sub:
                u = await db.get(User, uuid.UUID(sub))
                if u and _can_read(u, f.user_id):
                    authorized = True
        except (JWTError, ValueError):
            pass

    if not authorized:
        raise PermissionDenied()

    data = await service.read_file_bytes(f)
    return Response(
        content=data,
        media_type=f.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{f.file_name}"',
            # 1 day cache — same as token expiry; consumer asks for a new
            # token if the URL stops working.
            "Cache-Control": "private, max-age=86400",
        },
    )
