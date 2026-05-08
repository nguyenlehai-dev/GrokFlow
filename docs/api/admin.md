# Admin API

Prefix: `/api/admin`. Auth: JWT Bearer + role `admin`. Mọi endpoint tự kiểm `require_admin`.

## GET /api/admin/stats

Tổng quan hệ thống.

```json
{
  "total_users": 12,
  "total_api_keys": 34,
  "total_profiles": 28,
  "total_jobs": 1024,
  "jobs_24h_success": 87,
  "jobs_24h_failed": 3
}
```

## GET /api/admin/users

List toàn bộ user, sort theo `created_at` desc.

## POST /api/admin/users

```json
{
  "email": "user@x.com",
  "password": "Min8chars!",
  "full_name": "Optional",
  "role": "user"
}
```

`role` ∈ `{admin, user, support}`. Status mặc định `active`.

## PATCH /api/admin/users/{user_id}

```json
{
  "full_name": "...",
  "role": "user",
  "status": "banned",
  "password": "NewSecret123!"
}
```

Tất cả field optional. Password nếu pass sẽ rehash.

## DELETE /api/admin/users/{user_id}

Xóa hẳn user và cascade vào api_keys/profiles/jobs/files của họ. Không cho admin tự xóa chính mình (`422 invalid_payload`).

## Audit

Mọi action admin sinh `audit_logs` với `action` ∈ `{admin_create_user, admin_update_user, admin_delete_user}` và `target_id = user_id`.
