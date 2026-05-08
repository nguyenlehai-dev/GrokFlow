# Security

## 1. Identity

| Token | Audience | Scope |
|---|---|---|
| JWT (HS256) | Dashboard (`/api/*`) | Full quyền của user |
| API Key (`uxpm_live_*`) | Public (`/v1/*`) | Subset theo `allowed_providers` + `allowed_job_types` |

JWT secret + ENCRYPTION_KEY phải sinh ngẫu nhiên ≥32 byte và rotate có kế hoạch (Phase 4).

## 2. API Key

- Chỉ trả full key 1 lần (response của `POST /api/api-keys`).
- DB chỉ lưu `key_hash` (SHA-256). Không bao giờ log key plaintext.
- `key_prefix` (~17 ký tự) đủ để khách phân biệt nhiều key, không đủ để lộ secret.
- Revoke = set `status = revoked`. Không xóa hash để giữ FK của các job đã tạo.
- Hỗ trợ TTL (`expires_at`) cho key tạm.

## 3. Cookie / session profile

- Mã hóa Fernet (AES-128-CBC + HMAC-SHA256). Key lấy từ `ENCRYPTION_KEY`.
- Decrypt **chỉ** trong worker process khi cần dùng. Không bao giờ trả về FE/admin/log.
- Khi xóa profile: xóa folder `profile_path` + xóa record.
- Khi profile chuyển `expired`/`blocked`: KHÔNG decrypt nữa.

## 4. Authorization layers

```
[ HTTP request ]
       ↓
[ CORS middleware ]                ← whitelist origin (CORS_ORIGINS)
       ↓
[ Auth dependency ]                ← JWT hoặc API Key
       ↓
[ Role guard (require_admin) ]     ← chỉ admin endpoint
       ↓
[ Ownership guard ]                ← user_id == resource.user_id
       ↓
[ Scope check ]                    ← API Key allowed_providers/job_types
       ↓
[ Rate limit ]                     ← Phase 4: Redis token bucket
       ↓
[ Business logic ]
```

## 5. Validation

- Pydantic 2 cho mọi input (router signatures).
- Length limit prompt 4000 ký tự.
- Provider/job_type match regex strict.
- File upload (Phase 4): magic bytes check + size limit.

## 6. Audit log

Bắt buộc log với `audit_logs`:

- `login` (success + fail nếu có user_id)
- `create_api_key`, `revoke_api_key`, `delete_api_key`
- `create_profile`, `open_profile`, `check_profile`, `delete_profile`
- `create_job`, `retry_job`, `cancel_job`
- `admin_<action>` cho mọi action admin trên user khác

Field `metadata` JSONB chứa context (IP đã có cột riêng) nhưng **không** chứa secret.

## 7. Secrets management

- `.env` không commit. `.env.example` thì commit.
- Production: dùng secret manager (AWS Secrets Manager / Doppler / Vault). Không bake vào image.
- Rotate `JWT_SECRET` → revoke all sessions; `ENCRYPTION_KEY` → migration nặng vì phải re-encrypt cookies (Phase 4 lập kế hoạch).

## 8. Network

- HTTPS bắt buộc trên prod (terminate ở Nginx/load balancer).
- Public API có thể dùng IP allowlist per-key (Phase 4).
- Backend không gọi outbound trực tiếp đến provider — worker đi qua Playwright + Chrome có proxy nếu cần.

## 9. Browser sandbox

- Worker container không chạy với --privileged.
- Mỗi profile có user-data-dir riêng → cookie không leak giữa khách.
- Disable web security flags: KHÔNG dùng `--no-sandbox` trừ khi container đảm bảo isolation level OS.

## 10. Threat model rút gọn

| Mối đe dọa | Đối phó |
|---|---|
| Lộ JWT | TTL ngắn (24h default), https-only, có thể revoke bằng password change. |
| Lộ API Key | Hash trong DB, revoke bằng 1 endpoint, IP allowlist (Phase 4). |
| User A xem job user B | Ownership guard mọi endpoint. |
| Worker đọc cookie sai user | profile_path namespace theo `<user_id>/<profile_id>/`. |
| SQL injection | SQLAlchemy core, không string concat. |
| Prompt injection lên provider | Không phải attack vào hệ thống của ta — log lại, không cản. |
| DDoS qua public API | Rate limit theo key + theo IP (Phase 4). |
