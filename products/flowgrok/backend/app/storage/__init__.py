from app.core.config import settings
from app.storage.base import Storage
from app.storage.local_storage import LocalStorage


def get_storage() -> Storage:
    if settings.STORAGE_DRIVER == "local":
        return LocalStorage(settings.LOCAL_STORAGE_PATH)
    if settings.STORAGE_DRIVER == "s3":
        from app.storage.s3_storage import S3Storage  # noqa: WPS433
        return S3Storage()
    if settings.STORAGE_DRIVER == "minio":
        from app.storage.s3_storage import S3Storage  # noqa: WPS433
        return S3Storage()
    raise ValueError(f"Unsupported STORAGE_DRIVER={settings.STORAGE_DRIVER}")


__all__ = ["Storage", "get_storage"]
