# Webhooks

GrokFlow gửi POST event tới URL bạn cấu hình khi job kết thúc.

## Cấu hình

`PUT /api/settings/webhook`

```json
{ "webhook_url": "https://your-app.com/webhooks/grokflow", "rotate_secret": true }
```

Response (1 lần duy nhất khi rotate):

```json
{
  "webhook_url": "https://your-app.com/webhooks/grokflow",
  "has_secret": true,
  "new_secret": "..."
}
```

`new_secret` chỉ trả về khi rotate. Server lưu secret để ký HMAC; bạn lưu để verify.

## Events

| Event | Khi nào |
|---|---|
| `job.success` | Job hoàn tất, có `result_url` |
| `job.failed` | Job thất bại sau khi vượt `max_retry` |
| `job.cancelled` | User cancel job |

## Payload

```json
{
  "event": "job.success",
  "timestamp": "2026-05-08T10:01:20Z",
  "job": {
    "id": "uuid",
    "provider": "grok",
    "job_type": "image",
    "status": "success",
    "result_url": "/api/files/<file_id>/download",
    "error_message": null,
    "created_at": "2026-05-08T10:00:00Z",
    "completed_at": "2026-05-08T10:01:20Z"
  }
}
```

`result_url` là relative path; ghép với `https://flowgrok.vpspanel.io.vn` để có absolute. Endpoint `/api/files/{id}/download` cần JWT của user — không public. Để khách lấy file trực tiếp, dùng public API key qua `/v1/files/{id}` (Phase 4 sẽ thêm signed URL).

## Verify chữ ký

Header `X-Grokflow-Signature` = base64(HMAC-SHA256(secret, raw_body)).

Node.js:

```js
const sigHeader = req.headers["x-grokflow-signature"];
const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest("base64");
if (!crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected))) {
  return res.status(401).end();
}
```

Python:

```python
import hmac, hashlib, base64
expected = base64.b64encode(hmac.new(SECRET.encode(), raw_body, hashlib.sha256).digest()).decode()
if not hmac.compare_digest(headers["x-grokflow-signature"], expected):
    abort(401)
```

## Retry

GrokFlow retry **3 lần** với backoff 1s/4s/16s nếu endpoint trả 5xx hoặc timeout. Endpoint trả 4xx → bỏ luôn (giả định request không đúng format hoặc URL chết).

## Khuyến nghị endpoint của bạn

- Trả 2xx **càng sớm càng tốt** — đẩy việc xử lý vào background queue.
- Idempotent theo `job.id` — webhook có thể đến nhiều lần (mạng flake).
- Verify signature trước khi tin payload.
- Timeout response: GrokFlow đợi tối đa 10s rồi retry.
