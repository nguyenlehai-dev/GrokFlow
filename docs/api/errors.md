# Error codes

Format chung:

```json
{ "detail": { "code": "<machine_code>", "message": "<human readable>" } }
```

| HTTP | code | Khi nào |
|---|---|---|
| 401 | `invalid_credentials` | Login sai, JWT thiếu/hết hạn, user không active. |
| 401 | `invalid_api_key` | API Key thiếu, sai, đã revoke, hoặc owner không active. |
| 403 | `permission_denied` | Không phải chủ sở hữu / không phải admin / API Key không có scope. |
| 404 | `<resource>_not_found` | `api_key_not_found`, `profile_not_found`, `job_not_found`, `file_not_found`. |
| 409 | `profile_busy` | Profile đang chạy job khác. |
| 422 | `invalid_payload` | Body sai schema, provider/job_type không hợp lệ, profile mismatch provider. |
| 429 | `rate_limited` | Vượt rate limit phút hoặc daily. |
| 500 | `internal_error` | Lỗi không bắt được. |
| 503 | `provider_unavailable` | Browser automation thất bại do provider phía bên kia. |

## Khuyến nghị retry phía client

| Code | Retry? |
|---|---|
| `401`, `403`, `404`, `422` | ❌ Không retry — fix request. |
| `409 profile_busy` | ✅ Retry sau vài giây hoặc dùng profile khác. |
| `429 rate_limited` | ✅ Backoff exponential. |
| `500`, `503` | ✅ Backoff với max 3 lần. |
