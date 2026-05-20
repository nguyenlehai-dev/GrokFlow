from abc import ABC, abstractmethod
from pathlib import Path


class Storage(ABC):
    """Storage backend interface. Implementations must be safe to call from worker process."""

    driver: str = "base"

    @abstractmethod
    async def save(self, *, key: str, data: bytes, content_type: str | None = None) -> str:
        """Save bytes under `key`. Return canonical storage_path."""

    @abstractmethod
    async def open(self, key: str) -> bytes:
        """Read bytes by key. Raises FileNotFoundError if missing."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete file by key. No-op if not found."""

    @abstractmethod
    async def signed_url(self, key: str, ttl_seconds: int = 3600) -> str | None:
        """Return signed URL or None if driver does not support signing."""

    @staticmethod
    def safe_join(base: str, *parts: str) -> Path:
        p = Path(base).resolve().joinpath(*parts).resolve()
        if not str(p).startswith(str(Path(base).resolve())):
            raise ValueError(f"Path traversal detected: {p}")
        return p
