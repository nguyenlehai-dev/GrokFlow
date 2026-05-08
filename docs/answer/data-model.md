# Data Model

Định nghĩa chính tắc trong [`backend/app/models/__init__.py`](../../backend/app/models/__init__.py). Doc này tóm tắt quan hệ + business rules quan trọng.

## ERD

```
┌──────────┐ 1     N ┌──────────┐
│  users   │─────────│ api_keys │
└────┬─────┘         └────┬─────┘
     │ 1                  │
     │                    │
     │ N                  │ N (optional FK)
┌────▼─────┐         ┌────▼─────┐
│ profiles │         │   jobs   │
└────┬─────┘         └────┬─────┘
     │ 1 N (optional FK)  │ 1
     └────────────────────┤
                          │ N
                     ┌────▼─────┐
                     │ job_logs │
                     └──────────┘

users 1 ── N files
users 1 ── N audit_logs
```

## Bảng users

- `id` UUID PK
- `email` UNIQUE, indexed
- `password_hash` bcrypt
- `role` ∈ `{admin, user, support}`
- `status` ∈ `{active, inactive, banned, pending}`

Rule: chỉ `active` mới login + gọi API.

## Bảng api_keys

- `key_hash` SHA-256 của full key, UNIQUE indexed (lookup chính)
- `key_prefix` 8 ký tự đầu sau `uxpm_live_`, dùng để hiển thị
- `allowed_providers`, `allowed_job_types` JSONB array (empty = allow all? — không, MVP default empty = deny). Trong code: nếu list rỗng thì coi là deny (xem `public_v1/router.py::_check_perm`).
- `used_today` reset bằng cron 00:00 UTC.
- `status` ∈ `{active, revoked, expired}`.

Rule: không bao giờ trả `key_hash` qua API. `api_key` plaintext chỉ trả 1 lần khi `POST`.

## Bảng profiles

- `profile_path` đường dẫn tuyệt đối tới user-data-dir.
- `encrypted_cookie`, `encrypted_storage_state`: Fernet ciphertext, decrypt chỉ trong worker process.
- `status` xem [flows.md §2](./flows.md#2-lifecycle-profile).

Rule: 1 profile chỉ chạy 1 job tại 1 thời điểm. Dùng status `running_job` + advisory lock Postgres khi pick.

## Bảng jobs

- `profile_id` nullable: cho MVP phase 1 cho phép tạo job mock không cần profile.
- `input_payload` JSONB lưu options (size, quality, …) dạng raw — schema do từng provider quyết định.
- `result_file_id` UUID trỏ tới `files.id` (không FK cứng để tránh circular constraint).
- Status xem [flows.md §3](./flows.md#3-lifecycle-job).

Rule: chỉ owner hoặc admin xem được job.

## Bảng job_logs

Append-only. Worker ghi `info | warning | error | debug`. Dùng cho debug + audit. Không bao giờ ghi cookie/secret vào `context`.

## Bảng files

- `storage_driver` ∈ `{local, s3, minio, r2}`.
- `storage_path` driver-specific path.
- `public_url` populated khi sinh signed URL hoặc khi driver public.

Rule: chỉ owner xem được. Public access qua signed URL với TTL ngắn.

## Bảng audit_logs

Lưu các action quan trọng: `login`, `create_api_key`, `revoke_api_key`, `create_profile`, `open_profile`, `check_profile`, `create_job`, `retry_job`, `delete_profile`. Field `metadata` JSONB tự do, KHÔNG chứa secret.

> Lưu ý: column tên `metadata` (Python attr `audit_metadata`) vì SQLAlchemy reserved `metadata` cho declarative base.

## Index policy

- Mọi FK đều index.
- `users.email` UNIQUE.
- `api_keys.key_hash` UNIQUE indexed.
- `jobs.status` indexed cho worker poller.
- `audit_logs.action` indexed cho query audit theo action.

## Migration

Dùng Alembic. Lần đầu setup tự `Base.metadata.create_all` cho dev nhanh. Production: chỉ dùng Alembic. Khi đổi schema:

```powershell
cd backend
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```
