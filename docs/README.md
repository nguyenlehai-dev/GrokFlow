# GrokFlow Documentation

Tài liệu nội bộ cho dev team. Tổ chức theo 3 nhóm chính:

- **[`QUY-TRINH-DEPLOY.md`](./QUY-TRINH-DEPLOY.md)** ⭐ — hướng dẫn nhanh tiếng Việt: code → push → live trong 30s. Đọc trước.
- **[`PLANS-ENTITLEMENTS.md`](./PLANS-ENTITLEMENTS.md)** — gói (Plan) + phân quyền user; cách bán & override quyền.
- [`BRANCHING.md`](./BRANCHING.md) — chi tiết kỹ thuật quy trình branching + auto-deploy (English).
- [`docs/answer/`](./answer/) — phân tích, kiến trúc, quyết định thiết kế, ADR, hướng dẫn setup.
- [`docs/api/`](./api/) — đặc tả REST API (cả internal dashboard và public v1).

## Quick start

```bash
git clone https://github.com/nguyenlehai-dev/GrokFlow.git
cd GrokFlow && git checkout dev
# ... edit ...
git add -A && git commit -m "feat: ..."
git push origin dev               # CI test trên GitHub
git checkout prod && git merge --ff-only dev
git push origin prod              # ← live trong ~30s
```

Đọc [`QUY-TRINH-DEPLOY.md`](./QUY-TRINH-DEPLOY.md) cho từng bước chi tiết.

## Index

### Vận hành (deploy / branching)

- ⭐ [Quy trình deploy (tiếng Việt)](./QUY-TRINH-DEPLOY.md)
- [Plans & Entitlements (gói + phân quyền user)](./PLANS-ENTITLEMENTS.md)
- [Branching workflow (English, technical)](./BRANCHING.md)

### Answer

- [Phân tích dự án (gốc)](./answer/phan-tich-du-an-ui-ux-pro-max.md)
- [Kiến trúc tổng thể](./answer/architecture.md)
- [Setup môi trường dev](./answer/setup.md)
- [Sơ đồ luồng nghiệp vụ](./answer/flows.md)
- [Mô hình dữ liệu (ERD + bảng)](./answer/data-model.md)
- [Bảo mật](./answer/security.md)
- [Provider integration (Grok/Flow + viết provider mới)](./answer/providers.md)
- [Storage drivers](./answer/storage.md)
- [Rate limit](./answer/rate-limit.md)
- [Roadmap MVP theo Phase](./answer/roadmap.md)
- [Deployment lên VPS (Caddy + Let's Encrypt)](./answer/deployment.md)
- [Deploy với Cloudflare Tunnel (LAN/private server)](./answer/deploy-cloudflare-tunnel.md)

### API

- [Tổng quan API](./api/README.md)
- [Auth API](./api/auth.md)
- [API Keys API](./api/api-keys.md)
- [Profiles API](./api/profiles.md)
- [Jobs API (internal)](./api/jobs.md)
- [Files API](./api/files.md)
- [Audit Logs API](./api/audit.md)
- [Admin API](./api/admin.md)
- [Settings API](./api/settings.md)
- [Webhooks](./api/webhooks.md)
- [Public API v1 (cho khách tích hợp)](./api/public-v1.md)
- [Mã lỗi](./api/errors.md)

## Quy ước cập nhật docs

Bất kỳ thay đổi nào về API, schema DB, luồng nghiệp vụ phải đi kèm cập nhật doc tương ứng trong cùng PR. Doc lệch code là bug.
