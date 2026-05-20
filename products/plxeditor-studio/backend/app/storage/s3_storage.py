"""S3/MinIO/R2 storage stub. Wire up in Phase 4.

Install boto3 and add credentials to .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
S3_BUCKET, S3_ENDPOINT_URL for MinIO/R2).
"""

from app.storage.base import Storage


class S3Storage(Storage):
    driver = "s3"

    def __init__(self) -> None:
        raise NotImplementedError("S3 storage will be enabled in Phase 4. Use STORAGE_DRIVER=local for now.")

    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:  # pragma: no cover
        raise NotImplementedError

    async def open(self, key: str) -> bytes:  # pragma: no cover
        raise NotImplementedError

    async def delete(self, key: str) -> None:  # pragma: no cover
        raise NotImplementedError

    async def signed_url(self, key: str, ttl_seconds: int = 3600) -> str | None:  # pragma: no cover
        raise NotImplementedError
