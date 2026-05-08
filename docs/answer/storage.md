# Storage

Storage tách abstraction trong [`backend/app/storage/`](../../backend/app/storage/). Driver được chọn theo env `STORAGE_DRIVER`.

## Drivers

| Driver | Khi dùng | URL strategy |
|---|---|---|
| `local` | Dev, single-server prod nhỏ | Stream qua `/api/files/{id}/download` |
| `s3` | Prod (AWS/Cloudflare R2/Wasabi) | Signed URL TTL 1h |
| `minio` | Self-hosted on-prem | Signed URL TTL 1h |

## Interface

```python
class Storage(ABC):
    driver: str
    async def save(self, *, key: str, data: bytes, content_type: str | None) -> str
    async def open(self, key: str) -> bytes
    async def delete(self, key: str) -> None
    async def signed_url(self, key: str, ttl_seconds: int = 3600) -> str | None
```

`signed_url` trả `None` khi driver không hỗ trợ — caller fallback dùng API endpoint.

## Key convention

```
users/<user_id>/jobs/<job_id>/<file_name>
```

Cả 3 thành phần là UUID/safe string nên không cần escape.

## Bảo mật

- `Storage.safe_join` ngăn path traversal khi driver=local.
- File **không bao giờ public mặc định**. Truy cập phải qua endpoint kiểm ownership hoặc signed URL TTL ngắn.
- Signed URL phía S3: Phase 4 thêm middleware refresh + IP allowlist.

## Migration giữa drivers

Khi đổi `STORAGE_DRIVER`:

1. File cũ vẫn `storage_driver=local`. Code đã handle: `read_file_bytes` fallback đọc local nếu driver mismatch.
2. Job script `scripts/migrate_storage.py` (Phase 4) sẽ chuyển file local → S3 và update record.

## Cleanup

Phase 4 cron:

- Xóa file > 30 ngày của job đã `success` (config qua env).
- Xóa file của job `failed | cancelled | expired` ngay.
- Vacuum profile path của profile `expired > 30 days`.
