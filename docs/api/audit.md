# Audit Log API

Prefix: `/api/audit-logs`. Auth: JWT Bearer.

## GET /api/audit-logs

Self-service: user xem audit của chính họ.

Query: `action` (optional filter), `limit` (max 500, default 100).

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "action": "create_api_key",
    "target_type": "api_key",
    "target_id": "uuid",
    "ip_address": null,
    "metadata": {"name": "Prod", "providers": ["grok"], "job_types": ["image"]},
    "created_at": "2026-05-08T10:00:00Z"
  }
]
```

## GET /api/audit-logs/admin

Chỉ admin. Xem audit toàn hệ thống.

Query: `action`, `user_id`, `limit` (max 1000).

## Action codes hiện có

| Action | Trigger |
|---|---|
| `login` | User đăng nhập thành công |
| `create_api_key` | POST /api/api-keys |
| `revoke_api_key` | PATCH /api/api-keys/{id}/revoke |
| `create_job` | POST /v1/jobs/{image\|video} |
| `admin_create_user` | POST /api/admin/users |
| `admin_update_user` | PATCH /api/admin/users/{id} |
| `admin_delete_user` | DELETE /api/admin/users/{id} |

Sẽ bổ sung khi implement Phase 2-3: `open_profile`, `check_profile`, `delete_profile`, `create_profile`, v.v.

## Bảo mật

- `metadata` JSONB không bao giờ chứa secret (password, api_key plaintext, cookie).
- Chỉ kèm reference (id, name, role) hoặc giá trị đã mask.
- Append-only: không có endpoint `DELETE`/`PATCH`.
