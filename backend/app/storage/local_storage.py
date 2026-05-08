from pathlib import Path

from app.storage.base import Storage


class LocalStorage(Storage):
    driver = "local"

    def __init__(self, base_path: str) -> None:
        self.base = Path(base_path).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:
        path = self.safe_join(str(self.base), key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    async def open(self, key: str) -> bytes:
        path = self.safe_join(str(self.base), key)
        if not path.exists():
            raise FileNotFoundError(key)
        return path.read_bytes()

    async def delete(self, key: str) -> None:
        path = self.safe_join(str(self.base), key)
        if path.exists():
            path.unlink()

    async def signed_url(self, key: str, ttl_seconds: int = 3600) -> str | None:
        # Local has no signed URL — clients hit /api/files/{id}/download instead.
        return None
