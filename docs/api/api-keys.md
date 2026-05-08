# API Keys API

Prefix: `/api/api-keys`. Auth: JWT Bearer.

API Key chỉ trả về **đầy đủ một lần duy nhất** khi tạo (response `POST`). Sau đó DB chỉ giữ `key_prefix` + `key_hash`. Không có cách nào xem lại key gốc.

## GET /api/api-keys

List API key của user hiện tại.

**Response 200** — array of `ApiKeyOut`:

```json
[
  {
    "id": "uuid",
    "name": "Production Key",
    "key_prefix": "uxpm_live_AbCd1234",
    "status": "active",
    "allowed_providers": ["grok", "flow"],
    "allowed_job_types": ["image", "video"],
    "rate_limit_per_minute": 60,
    "daily_limit": 1000,
    "used_today": 12,
    "last_used_at": "2026-05-08T09:30:00Z",
    "expires_at": null,
    "created_at": "2026-05-01T08:00:00Z"
  }
]
```

## POST /api/api-keys

Tạo API key mới.

**Request**

```json
{
  "name": "Production Key",
  "allowed_providers": ["grok", "flow"],
  "allowed_job_types": ["image", "video"],
  "daily_limit": 1000,
  "rate_limit_per_minute": 60,
  "expires_at": null
}
```

**Response 201** — `ApiKeyOut` + extra:

```json
{
  "id": "uuid",
  "name": "Production Key",
  "key_prefix": "uxpm_live_AbCd1234",
  "status": "active",
  "allowed_providers": ["grok", "flow"],
  "allowed_job_types": ["image", "video"],
  "rate_limit_per_minute": 60,
  "daily_limit": 1000,
  "used_today": 0,
  "api_key": "uxpm_live_AbCd1234XYZ...full_secret_here",
  "warning": "Key chỉ hiển thị một lần. Hãy copy và lưu lại an toàn."
}
```

**Errors**

- `422 invalid_payload` — provider hoặc job_type không hợp lệ.

## GET /api/api-keys/{id}

Xem chi tiết một key (không trả về secret). Phải là chủ sở hữu hoặc admin.

## PATCH /api/api-keys/{id}/revoke

Revoke key. Sau đó key không thể dùng để gọi `/v1/*`.

**Response 200** — `ApiKeyOut` với `status: "revoked"`.

## DELETE /api/api-keys/{id}

Xóa hẳn record.

**Response 204** (no body).
