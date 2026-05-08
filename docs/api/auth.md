# Auth API

Prefix: `/api/auth`. Auth bằng JWT Bearer token (trừ `login`).

## POST /api/auth/login

Đăng nhập email + password, trả về JWT.

**Request**

```json
{ "email": "user@example.com", "password": "secret123" }
```

**Response 200**

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

**Errors**

- `401 invalid_credentials` — sai email/password hoặc account không active.

## POST /api/auth/logout

Stateless — client chỉ cần xóa token. Endpoint giữ để client gọi nếu muốn audit/analytics.

**Response 200** `{ "ok": true }`

## GET /api/auth/me

Trả về user hiện tại theo token.

**Response 200**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "User Name",
  "role": "user",
  "status": "active",
  "created_at": "2026-05-08T10:00:00Z"
}
```

**Errors**

- `401 invalid_credentials` — token thiếu, hết hạn, hoặc user không active.

## Cách gửi token

```
Authorization: Bearer eyJhbGciOi...
```

JWT payload: `{ "sub": "<user_id>", "role": "<role>", "exp": <unix> }`.
