# Jobs API (internal)

Prefix: `/api/jobs`. Auth: JWT Bearer. Dùng cho dashboard.

Public API (qua API Key) ở [public-v1.md](./public-v1.md).

## Trạng thái job

| Status | Ý nghĩa |
|---|---|
| `pending` | Khởi tạo, chưa enqueue. |
| `queued` | Đã đẩy vào Redis queue. |
| `running` | Worker đã pick. |
| `processing_provider` | Đang gửi prompt + chờ provider. |
| `uploading_result` | Đang upload kết quả lên storage. |
| `success` | Hoàn tất, có `result_url`. |
| `failed` | Lỗi; xem `error_message` + logs. |
| `cancelled` | User cancel. |
| `expired` | Quá `JOB_TIMEOUT_SECONDS`. |

## GET /api/jobs

Query params:

- `status` — filter theo status
- `limit` — default 50, max 200

## POST /api/jobs

```json
{
  "provider": "grok",
  "job_type": "image",
  "prompt": "A modern dashboard UI",
  "profile_id": "optional-uuid",
  "size": "1024x1024",
  "model": "aurora",
  "style": "natural",
  "n": 1,
  "seed": null,
  "input_image_file_id": "optional-uuid (image-to-image)",
  "options": { "extra": "free-form" }
}
```

**Profile resolution (v0.4+)**:
- Nếu `profile_id` truyền vào → backend xác minh profile thuộc admin pool và đang `logged_in`/`running_job`. Nếu không → `403 permission_denied` hoặc `422 invalid_payload`.
- Nếu `profile_id` để trống → backend auto-pick admin profile cùng provider, status `logged_in`, ưu tiên cái least-recently-used.
- Pool rỗng → `422 invalid_payload "Không có profile {provider} nào sẵn sàng trong pool"`.

Backend tự enqueue. Trả về `JobOut` với `status: queued`.

## GET /api/jobs/{id}

Xem chi tiết. Phải là chủ sở hữu hoặc admin.

## POST /api/jobs/{id}/retry

Chỉ áp dụng cho `failed | cancelled | expired`. `retry_count++`, status về `queued`.

## POST /api/jobs/{id}/cancel

Áp dụng cho job chưa kết thúc. Worker sẽ kiểm tra cờ `cancelled` ở các checkpoint.

## GET /api/jobs/{id}/logs

Trả về list `JobLog` (level: `info|warning|error|debug`).
