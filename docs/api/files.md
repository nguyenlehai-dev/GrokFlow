# Files API

Prefix: `/api/files`. Auth: JWT Bearer.

File chỉ truy cập được bởi owner hoặc admin. Public API v1 cũng có `/v1/files/{id}` để khách lấy metadata bằng API Key.

## GET /api/files/{file_id}

Metadata + URL download.

```json
{
  "id": "uuid",
  "file_name": "result.png",
  "file_type": "image",
  "mime_type": "image/png",
  "file_size": 102400,
  "download_url": "/api/files/{id}/download"
}
```

## GET /api/files/{file_id}/download

Trả binary content với header:

```
Content-Type: image/png
Content-Disposition: inline; filename="result.png"
```

Nếu storage driver hiện tại là S3/MinIO, response sẽ redirect 302 về signed URL (Phase 4). Hiện tại (local) trả thẳng bytes.

## Lưu ý

- Local storage: file lưu tại `LOCAL_STORAGE_PATH/users/<user_id>/jobs/<job_id>/<file_name>`.
- Path traversal: helper `Storage.safe_join` chặn `../` ở storage layer.
- Mime type: lưu chính xác từ provider, không guess lại khi serve.
