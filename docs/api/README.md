# API Reference

Hai bề mặt API tách biệt:

| Surface | Prefix | Auth | Dùng cho |
|---|---|---|---|
| Internal Dashboard | `/api/*` | JWT (Bearer) | UI dashboard. Quản lý CRUD đầy đủ. |
| Public Integration | `/v1/*` | API Key (Bearer) | Khách hàng tích hợp tạo job từ hệ thống của họ. |

OpenAPI tự sinh: `GET /docs` (Swagger UI) hoặc `GET /openapi.json`.

## Common

- Body: JSON (`Content-Type: application/json`)
- Response error: `{"detail": {"code": "<code>", "message": "<text>"}}`
- Timestamp: ISO 8601 UTC
- ID: UUID v4

## Files

- [Auth](./auth.md)
- [API Keys](./api-keys.md)
- [Profiles](./profiles.md)
- [Jobs (internal)](./jobs.md)
- [Files](./files.md)
- [Audit Logs](./audit.md)
- [Admin](./admin.md)
- [Settings (webhook + password)](./settings.md)
- [Webhooks](./webhooks.md)
- [Public API v1](./public-v1.md)
- [Mã lỗi](./errors.md)
