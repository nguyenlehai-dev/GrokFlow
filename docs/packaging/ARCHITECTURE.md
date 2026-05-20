# Architecture — Cách hệ thống được phân chia

Doc này giải thích vì sao monorepo có 3 folder phụ + tại sao khách lại
nhận repo riêng, không phải monorepo.

## Vấn đề phải giải

Bạn (PLX Editor) muốn bán 3 sản phẩm:
1. **flowgrok** — gateway Grok image+video
2. **ai-gateway** — router multi-LLM (OpenAI, Anthropic, ...)
3. **plxeditor-studio** — editor full (Grok + Flow video tools)

3 sản phẩm chia sẻ chung:
- Auth + admin shell (user / role / domain / quota)
- Billing + plans + invoices
- File storage + entitlements
- Notification

3 ràng buộc:
1. **Khách cài trên VPS của họ** → data riêng, không leak chéo
2. **Khách không thấy code 2 product khác** → để upsell sau, để giữ IP
3. **Update 1 lần áp được cho cả 3** → bạn không phải sync 3 codebase

Mô hình "monorepo + packaging" sinh ra để đáp ứng 3 ràng buộc.

## Cấu trúc monorepo

```
GrokFlow/                        ← repo private chỉ bạn có
├── backend/                     ← code BE canonical
│   └── app/
│       ├── core/                ← config, deps, security, http_client
│       ├── models/              ← SQLAlchemy: User, Domain, Plan, Job, FlowJob, GwRequest, ...
│       ├── modules/             ← feature modules
│       │   ├── auth/            ← shared
│       │   ├── admin/           ← shared
│       │   ├── entitlements/    ← shared
│       │   ├── landing/         ← shared
│       │   ├── grok/            ← product Grok (cho flowgrok + plxeditor-studio)
│       │   ├── flow/            ← product Flow (cho plxeditor-studio)
│       │   ├── gateway/         ← product Gateway (cho ai-gateway)
│       │   ├── tool/            ← chat / prompt-templates (gateway)
│       │   ├── tool_install/    ← desktop client registry
│       │   ├── servers/         ← VPS monitoring (chỉ monorepo)
│       │   ├── admin_modules/   ← module marketplace (chỉ monorepo)
│       │   └── sdk/             ← SDK đóng gói cho khách (monorepo)
│       ├── providers/           ← Grok / OpenAI / Anthropic / Gemini API clients
│       ├── browser/             ← Chromium + VNC + Playwright (Grok)
│       ├── services/            ← VNC sync / WARP watchdog / etc
│       ├── workers/             ← background jobs
│       ├── storage/             ← local + S3 file backends
│       ├── scripts/             ← create_admin, seed_demo, ...
│       ├── main.py
│       ├── alembic/             ← 43+ migrations
│       └── ...
├── frontend/                    ← code FE canonical
│   └── src/
│       ├── core/                ← axios, auth store, domain store, i18n
│       ├── components/          ← shared UI (AppShell, Toast, ConfirmDialog, ...)
│       ├── app/                 ← router, moduleRegistry
│       └── modules/             ← per-feature pages + nav
│           ├── auth/            ← shared
│           ├── admin/           ← shared
│           ├── landing/         ← shared
│           ├── grok/            ← product Grok
│           ├── flow/            ← product Flow
│           ├── gateway/         ← product Gateway
│           ├── tool/            ← VIP super_admin dashboard
│           ├── tool_distribution/ ← installer downloads
│           └── servers/         ← VPS monitoring (chỉ monorepo)
├── products/                    ← per-product packaging configs
│   ├── _scripts/                ← shared scripts
│   │   ├── customer_setup.sh    ← khách dùng — first install
│   │   ├── customer_update.sh   ← khách dùng — pull + rebuild
│   │   ├── export_product.py    ← bạn dùng — assemble + push
│   │   ├── promote_super_admin.sh
│   │   ├── deploy_plxeditor_studio.sh
│   │   └── README.md
│   ├── flowgrok/
│   │   ├── manifest.yaml        ← khai báo: modules nào, drop gì, patches
│   │   ├── overrides/           ← file ghi đè canonical (vd: trimmed models/__init__)
│   │   ├── docker-compose.yml   ← compose riêng product
│   │   ├── HANDOFF.md
│   │   ├── LICENSE.txt
│   │   └── deploy/              ← install_nginx.sh, install_warp_proxy.sh, ...
│   ├── ai-gateway/
│   │   └── ... (như trên)
│   └── plxeditor-studio/
│       └── ... (như trên)
└── docs/
    └── packaging/               ← bạn đang đọc
```

## Cấu trúc repo khách (cài trên VPS của họ)

Khi bạn chạy `export_product.py flowgrok`, script lắp ra cấu trúc:

```
flowgrok/                        ← repo public khách clone từ GitHub
├── backend/
│   └── app/
│       ├── core/                ← copy từ monorepo
│       ├── models/              ← copy + overrides (trimmed __init__.py)
│       ├── modules/
│       │   ├── auth/            ← copy
│       │   ├── admin/           ← copy (đã patch dashboard/gallery)
│       │   ├── entitlements/    ← copy
│       │   ├── grok/            ← copy
│       │   └── landing/         ← copy (chỉ billing + plans_public + client_api + public_v1)
│       ├── providers/           ← Grok-specific (drop OpenAI/Anthropic providers)
│       ├── browser/             ← copy (Grok runtime)
│       ├── services/            ← copy
│       ├── workers/             ← copy
│       ├── storage/             ← copy
│       ├── scripts/             ← copy
│       ├── main.py              ← copy
│       └── alembic/             ← copy 43 migrations
├── frontend/
│   └── src/
│       ├── core/                ← copy
│       ├── components/          ← copy (AppShell patched: drop module marketplace UI)
│       ├── app/                 ← copy (moduleRegistry override: chỉ admin+grok+auth+landing)
│       └── modules/
│           ├── auth/            ← copy
│           ├── admin/           ← copy (drop AdminGitPage/AdminModulesPage)
│           ├── grok/            ← copy
│           └── landing/         ← copy
├── docker-compose.yml           ← từ products/flowgrok/
├── _scripts/                    ← customer_setup.sh, customer_update.sh
├── deploy/                      ← install_nginx.sh, install_warp_*.sh
├── HANDOFF.md
└── LICENSE.txt
```

Khách **không thấy**:
- `app/modules/flow`, `gateway`, `tool`, `tool_install`, `servers`, `sdk`, `admin_modules`
- `frontend/src/modules/flow`, `gateway`, `servers`, `tool*`
- Bất kỳ thông tin nào về 2 sản phẩm khác
- File `products/` (đó là vùng dev của bạn)
- File `docs/`

## Pipeline export

```
                           manifest.yaml
                                │
                                ▼
                  ┌─────────────────────────────┐
                  │  export_product.py reads:   │
                  │                             │
                  │  include.backend (paths)    │
                  │  include.frontend (paths)   │
                  │  drop (paths to delete)     │
                  │  overrides/<files>          │
                  │  patches (regex sub)        │
                  │  module_registry.backend    │
                  └──────────────┬──────────────┘
                                 │
                                 ▼
                       (temp staging dir)
                                 │
                  ┌──────────────┼──────────────┐
                  │              │              │
                  ▼              ▼              ▼
            git init        git commit       git push --force
                                                  │
                                                  ▼
                              GitHub: nt7310063-boop/<name>
                                                  │
                              (customer pulls via _scripts/customer_update.sh)
```

Mỗi run là idempotent — staging dir là temp, mỗi lần fresh.

## Tại sao không đơn giản hơn?

### Tại sao không dùng git submodule?

Submodule lồng repo bên trong folder. Nhưng repo khách chứa toàn bộ app
(backend + frontend), không phải chỉ subset của một module folder. Lồng
toàn bộ `flowgrok` vào `frontend/src/modules/grok/` → cấu trúc đệ quy
rối.

### Tại sao không multi-tenant (`Domain`) thay vì 3 stack?

Multi-tenant chia sẻ 1 backend cho nhiều khách qua hostname. **Đã có
sẵn** trong monorepo + chạy trên port 5173/8000.

Nhược điểm:
- Bug 1 product ảnh hưởng tất cả khách
- Data tất cả khách ở 1 DB → nếu bị hack 1 lần, hỏng hết
- Khó cấp khách quyền backup / restore / migrate
- Tốn của bạn (vendor) host

Mô hình 3 stack:
- Bug ở khách A không ảnh hưởng B/C
- Data ở VPS khách → khách tự quản
- Khách trả tiền VPS riêng của họ
- Bạn chỉ ship code

### Tại sao không grokflow-core PyPI package?

Tương lai có thể làm: extract `auth+admin+billing+entitlements` ra
package private (`pip install grokflow-core`). Mỗi product `pip install`
package + chỉ chứa code product-specific.

Hiện chưa làm vì:
- Setup CI/CD private registry phức tạp
- Version pinning khó debug khi khách cài
- `export.py` hiện tại đủ tốt — sửa monorepo 1 chỗ, ship 3 product 1 lệnh

Phase B-future sẽ làm nếu codebase shared lớn lên đáng kể.

## Per-product diff

| Aspect | flowgrok | ai-gateway | plxeditor-studio |
|--------|----------|------------|------------------|
| Routes | 132 | 127 | 143 |
| Modules | 17 | 14 | 19 |
| Grok runtime | ✅ | ❌ | ✅ |
| Chromium VNC | ✅ | ❌ | ✅ |
| Flow video tools | ❌ | ❌ | ✅ |
| Gateway router | ❌ | ✅ | ❌ |
| Partner API (`/api/client/*`) | ✅ | ❌ | ✅ |
| Workers (Job queue) | ✅ | ❌ | ✅ |
| Image size | ~4.8 GB (BE) + 76 MB (FE) | ~1 GB BE + 76 MB FE | ~4.8 GB + 76 MB |
| Min VPS | 4 vCPU / 8GB | 2 vCPU / 4GB | 4 vCPU / 8GB |
