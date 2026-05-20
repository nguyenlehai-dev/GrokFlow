import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import File
from app.storage import get_storage


def _key_for(user_id: uuid.UUID, job_id: uuid.UUID | None, file_name: str) -> str:
    bucket = str(job_id) if job_id else "uploads"
    return f"users/{user_id}/jobs/{bucket}/{file_name}"


async def save_job_result(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    job_id: uuid.UUID | None,
    file_name: str,
    file_type: str,  # "image" | "video" | "input"
    mime_type: str,
    data: bytes,
) -> File:
    storage = get_storage()
    key = _key_for(user_id, job_id, file_name)
    storage_path = await storage.save(key=key, data=data, content_type=mime_type)

    rec = File(
        user_id=user_id,
        job_id=job_id,  # None is allowed — uploaded inputs are attached later
        file_name=file_name,
        file_type=file_type,
        mime_type=mime_type,
        storage_driver=storage.driver,
        storage_path=storage_path,
        file_size=len(data),
    )
    db.add(rec)
    await db.flush()
    return rec


async def read_file_bytes(file: File) -> bytes:
    if file.storage_driver != settings.STORAGE_DRIVER:
        # Driver mismatch — usually means env changed after upload. Try local fallback.
        path = Path(settings.LOCAL_STORAGE_PATH).resolve() / file.storage_path
        return path.read_bytes()
    storage = get_storage()
    return await storage.open(file.storage_path)
