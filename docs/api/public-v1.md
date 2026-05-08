# Public API v1

Prefix: `/v1`. Auth: API Key qua header `Authorization: Bearer uxpm_live_xxx`.

Đây là bề mặt API cho khách tích hợp vào hệ thống của họ. Versioned (`v1`) — sẽ duy trì backward compatibility trong major version.

## Authentication

```
Authorization: Bearer uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxx
```

Backend check:

1. Hash key bằng SHA-256 → tìm trong `api_keys.key_hash`.
2. `api_key.status == "active"`.
3. `expires_at` chưa quá hạn.
4. Owner user `status == "active"`.

Sau đó với từng endpoint còn check `allowed_providers` và `allowed_job_types`.

## POST /v1/jobs/image

```json
{
  "provider": "grok",
  "profile_id": "optional-uuid",
  "prompt": "A clean modern dashboard UI",
  "options": { "size": "1024x1024", "quality": "high" }
}
```

**Response 201**

```json
{
  "job_id": "uuid",
  "status": "queued",
  "message": "Job đã được đưa vào hàng đợi."
}
```

## POST /v1/jobs/video

Tương tự `image`. Quyền cần có: `provider:<x>` + `job:video`.

## GET /v1/jobs/{job_id}

```json
{
  "job_id": "uuid",
  "status": "success",
  "result_url": "https://your-domain.com/files/abcd.png",
  "error_message": null,
  "created_at": "2026-05-08T10:00:00Z",
  "completed_at": "2026-05-08T10:01:20Z"
}
```

Polling khuyến nghị: 2-5 giây/lần đến khi status `success | failed | cancelled | expired`.

## GET /v1/jobs

List job của user. Query: `limit` (max 200).

## GET /v1/files/{file_id}

Trả về metadata + URL file. URL có thể là signed link hết hạn (production) hoặc relative `/api/files/{id}/download` (dev).

## Ví dụ tích hợp

### curl

```bash
curl -X POST https://api.yourdomain.com/v1/jobs/image \
  -H "Authorization: Bearer uxpm_live_xxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "grok",
    "prompt": "A clean modern SaaS dashboard UI",
    "options": { "size": "1024x1024" }
  }'
```

### JavaScript

```js
const res = await fetch("https://api.yourdomain.com/v1/jobs/image", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.GROKFLOW_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    provider: "grok",
    prompt: "A modern dashboard",
    options: { size: "1024x1024" },
  }),
});
const { job_id } = await res.json();
```

### Python

```python
import httpx

resp = httpx.post(
    "https://api.yourdomain.com/v1/jobs/image",
    headers={"Authorization": f"Bearer {KEY}"},
    json={"provider": "grok", "prompt": "A modern dashboard"},
)
job_id = resp.json()["job_id"]
```

## Rate limit

- Per minute: theo `api_key.rate_limit_per_minute` (default 60).
- Per day: theo `api_key.daily_limit` (counter `used_today`, reset 00:00 UTC).
- Vượt → `429 rate_limited`.
