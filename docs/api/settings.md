# Settings API

Prefix: `/api/settings`. Auth: JWT Bearer.

## GET /api/settings/webhook

```json
{ "webhook_url": "https://...", "has_secret": true }
```

## PUT /api/settings/webhook

```json
{ "webhook_url": "https://...", "rotate_secret": false }
```

`rotate_secret=true` (hoặc lần đầu set `webhook_url`) → server sinh secret mới và trả qua field `new_secret`. Sau đó server không tiết lộ secret nữa — chỉ rotate.

Set `webhook_url=null` → xóa cả URL và secret.

## POST /api/settings/password

```json
{ "current_password": "old", "new_password": "newSecret123!" }
```

Response 200 `{"ok": true}`. Sai mật khẩu cũ → `401 invalid_credentials`.

Sau đổi password, mọi JWT cũ vẫn hợp lệ đến khi hết hạn (không có server-side revoke trong Phase 1-4 — Phase 5 sẽ thêm session table). Khuyến nghị đổi định kỳ + dùng JWT TTL ngắn nếu lo.

## Liên quan

- [Webhooks payload + verify signature](./webhooks.md)
