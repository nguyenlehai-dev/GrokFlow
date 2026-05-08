# Profiles API

Prefix: `/api/profiles`. Auth: JWT Bearer.

**Ownership model (v0.4+):** profiles được **admin sở hữu và quản lý tập trung**. Khách hàng (role `user`) chỉ **nhìn thấy pool admin đã đăng nhập sẵn** và pick khi tạo job — không tự tạo, không upload cookies, không xóa.

| Action | Customer (role=user) | Admin |
|---|---|---|
| `GET /api/profiles` | ✅ chỉ thấy admin profile `logged_in` | ✅ thấy tất cả |
| `POST /api/profiles` | ❌ 403 | ✅ |
| `PATCH/DELETE/check-session/disable` | ❌ 403 | ✅ |
| `POST /upload-cookies` / `helper-token` / `upload-cookies-helper` | ❌ 403 | ✅ |
| Picker khi tạo job | ✅ chọn từ pool hoặc auto-pick | ✅ |

## Trạng thái

| Status | Ý nghĩa |
|---|---|
| `created` | Vừa tạo, chưa từng mở browser. |
| `opening` | Worker/desktop helper đang mở Chrome. |
| `logged_in` | Session check OK, sẵn sàng chạy job. |
| `need_login` | Cookie hết hạn hoặc chưa login lần nào. |
| `expired` | Hết hạn lâu, có thể cần xóa & tạo lại. |
| `blocked` | Provider chặn tài khoản. |
| `running_job` | Đang được worker dùng để chạy job. |
| `disabled` | User/admin disable, không tham gia queue. |

## GET /api/profiles

List profiles của user hiện tại (loại trừ `deleted`).

## POST /api/profiles

```json
{ "name": "Grok Account 01", "provider": "grok" }
```

**Response 201** — `ProfileOut`. Backend sẽ tạo thư mục `PROFILE_BASE_PATH/<user_id>/<profile_id>/`.

## GET /api/profiles/{id}

Chi tiết profile. Không trả về cookie/session.

## PATCH /api/profiles/{id}

```json
{ "name": "...", "status": "disabled" }
```

User chỉ được set `status = disabled`. Admin có thể set bất kỳ status nào.

## DELETE /api/profiles/{id}

Xóa profile (record + folder cleanup do worker scheduler dọn).

## POST /api/profiles/{id}/open-browser

Đánh dấu profile `opening`. Trên môi trường server-side, trigger worker spawn Chrome với `--user-data-dir=<profile_path>`. Trên môi trường desktop helper (Phase 2), helper local sẽ poll và mở browser.

**Response 200**

```json
{
  "profile_id": "uuid",
  "status": "opening",
  "message": "Profile được đánh dấu opening. Worker/desktop helper sẽ mở Chrome..."
}
```

## POST /api/profiles/{id}/check-session

Trigger kiểm tra session bằng Playwright headless. Update `last_login_check_at` và đổi `status` (`logged_in` / `need_login` / `expired`).

**Response 200** — `ProfileOut` đã cập nhật.

## POST /api/profiles/{id}/upload-cookies

Upload exported cookies JSON từ extension Cookie-Editor (Chrome) đã đăng nhập tài khoản provider.

**Request** — multipart/form-data:

```
file: <cookies.json>
```

File limit 1MB, format = array of cookie objects (Cookie-Editor "Export as JSON").

**Response 200** — profile chuyển sang `logged_in` nếu import OK.

**Errors**

- `409` profile đang `running_job` — đợi job xong rồi upload.
- `422 invalid_payload` — file không đúng JSON array hoặc Playwright reject.

Server mã hóa cookies bằng Fernet trước khi lưu vào profile dir. Không bao giờ trả cookies về frontend.

## POST /api/profiles/{id}/disable

Shortcut set `status = disabled`.
