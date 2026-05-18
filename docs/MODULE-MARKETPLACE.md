# Module Marketplace — Plugin system cho GrokFlow

GrokFlow core đóng (private). Member dev plugin trong repo riêng của họ,
gửi URL repo, admin paste vào UI → core tự clone + build + chạy + nhúng
module vào sidebar admin.

## Quyết định thiết kế

| | Chọn | Lý do |
|---|---|---|
| Mức tích hợp UI | **Iframe + `@grokflow/ui` npm pkg** | Đồng nhất theme với core, isolation hoàn toàn |
| DB cho module | **Schema riêng `mod_<slug>`** + user riêng | Module không truy cập được data core hay module khác |
| Auth | Service token + iframe URL token | Module verify token bằng cách call `/api/sdk/auth/verify` |
| NPM publish | npm public (`@grokflow/ui`) | Đơn giản nhất; member chỉ cần `npm i` |
| Multi-tenant | Phase 1: KHÔNG (1 install = bật cho all tenant) | Phase 3 thêm `tenant_modules` table |
| Resource budget | 512MB RAM / 0.5 vCPU / 100 PID per module | Override per-module trong manifest, max cap ở core |

## Kiến trúc

```
┌────────────────────────────────────────────────────────────────┐
│  Core (private repo)                                           │
│  - FE: React SPA — đọc admin_modules table → render sidebar    │
│  - BE: FastAPI — /api/admin/modules/* + /api/sdk/*             │
│  - DB: public schema (core data) + mod_<slug> schemas (modules)│
└────────────────────────────────────────────────────────────────┘
         │ docker SDK             │ HTTP /api/sdk/*
         ▼                        ▲
┌──────────────────────────┐      │
│  Module container x2     │      │
│  - grokflow-mod-X-fe     │──────┘
│  - grokflow-mod-X-be     │
│  Network: grokflow_default                                 
│  DB user: mod_X_user (chỉ thấy schema mod_X + read core whitelist)
│  Hardened: cap_drop ALL, read_only, mem 512m, no docker.sock
└──────────────────────────┘
         │
         ▼
   Nginx vhost: /m/<slug>/api → mod-be, /m/<slug>/ → mod-fe
         │
         ▼
   Core sidebar render <iframe src="/m/<slug>/?token=..."/>
```

## Module repo structure (member tạo)

```
my-module/
├── module.manifest.json        ← Required
├── frontend/
│   ├── Dockerfile              ← Required
│   ├── package.json            ← deps: @grokflow/ui, react, react-dom, vite
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       └── App.tsx
├── backend/
│   ├── Dockerfile              ← Required
│   ├── requirements.txt
│   ├── alembic.ini             ← Module migrations
│   ├── alembic/
│   │   └── versions/
│   └── app/
│       ├── main.py             ← FastAPI app
│       └── sdk.py              ← Helper verify token + call core API
├── docker-compose.dev.yml      ← Local dev với mock core
└── README.md
```

## Manifest schema

`module.manifest.json`:

```json
{
  "$schema": "https://grokflow.dev/schemas/module-v1.json",
  "name": "invoice",
  "version": "1.0.0",
  "author": "member-username",
  "description": "Invoice management",

  "menu": {
    "label": "Hoá đơn",
    "icon": "FileText",
    "order": 100,
    "group": "Business"
  },

  "frontend": {
    "dockerfile": "frontend/Dockerfile",
    "port": 80,
    "build_args": { "VITE_APP_NAME": "Invoice" }
  },

  "backend": {
    "dockerfile": "backend/Dockerfile",
    "port": 8000,
    "health_path": "/health",
    "startup_command": "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0"
  },

  "database": {
    "schema": "mod_invoice",
    "read_core_tables": ["users", "domains"]
  },

  "permissions": {
    "scopes": ["read:user", "write:audit_log"]
  },

  "resources": {
    "memory": "512m",
    "cpus": 0.5
  }
}
```

## Env vars core inject vào module container

### Backend container

| Var | Mô tả |
|---|---|
| `MODULE_DB_URL` | `postgresql://mod_<slug>_user:<pw>@postgres:5432/grokflow?options=-csearch_path=mod_<slug>` |
| `GROKFLOW_API_URL` | `http://grokflow-backend-1:8000/api/sdk` (internal docker DNS) |
| `GROKFLOW_SERVICE_TOKEN` | Token định danh module → dùng để gọi core SDK API |
| `MODULE_SLUG` | `invoice` |

### Frontend container (build-time args)

| Arg | Mô tả |
|---|---|
| `VITE_MODULE_API_BASE` | `/m/<slug>/api` |
| `VITE_GROKFLOW_API` | `/api/sdk` |

## Core SDK endpoints (module gọi ngược lại)

Tất cả require header `X-GrokFlow-Service-Token: <token>`.

| Endpoint | Mục đích |
|---|---|
| `POST /api/sdk/auth/verify` | Verify user token (từ iframe URL) → trả `{user_id, role, tenant_id}` |
| `GET /api/sdk/users/me` | Module hỏi info user đang dùng |
| `GET /api/sdk/tenants/current` | Module hỏi tenant context |
| `POST /api/sdk/audit/log` | Module ghi audit log (cần scope `write:audit_log`) |
| `POST /api/sdk/notifications/send` | Module gửi notification cho user (cần scope `send:notification`) |

## Bảng `admin_modules`

```
id              UUID PK
slug            varchar(64) UNIQUE
git_url         text
git_ref         varchar(128)         -- branch hoặc commit sha
git_token_enc   text                 -- encrypted GitHub PAT
version         varchar(32)
manifest        jsonb                -- full manifest copy
fe_container_id varchar(128)
be_container_id varchar(128)
db_schema       varchar(64)
db_user         varchar(64)
db_password_enc text                 -- encrypted
service_token   varchar(128)         -- module → core auth
status          varchar(32)          -- installing|running|stopped|error
last_error      text
installed_at    timestamptz
installed_by    UUID FK users(id)
updated_at      timestamptz
```

## Install flow

```
1.  Validate URL + parse manifest
2.  Static scan (trivy + semgrep) trên repo
3.  Create DB: `CREATE SCHEMA mod_<slug>; CREATE USER mod_<slug>_user ...`
4.  Build FE + BE images với `docker build`
5.  Spawn 2 containers (hardened: cap_drop, read_only, mem_limit, no socket)
6.  Wait /health (60s budget) → fail = rollback
7.  Generate nginx vhost `/m/<slug>/...`
8.  Insert vào `admin_modules`
9.  Sidebar admin re-fetch → menu item xuất hiện
```

## Uninstall flow

```
1.  Stop + rm cả 2 container
2.  Remove vhost file → nginx reload
3.  DROP SCHEMA mod_<slug> CASCADE (option: backup trước)
4.  DROP USER mod_<slug>_user
5.  Remove `/srv/grokflow-modules/<slug>` work dir
6.  Delete `admin_modules` row
```

## Security baseline (per module container)

```yaml
cap_drop: [ALL]
security_opt: [no-new-privileges]
read_only: true
tmpfs: { /tmp: "rw,size=64m" }
mem_limit: 512m  # manifest có thể yêu cầu thấp hơn, không cao hơn
cpus: 0.5
pids_limit: 100
network: grokflow_default
# KHÔNG mount docker.sock
# KHÔNG mount host fs ngoài /tmp tmpfs
```

## Roadmap — status update

| Phase | Done | Notes |
|---|---|---|
| 1 — MVP scaffold | ✅ | Manifest schema, install endpoint, sidebar wiring |
| 1.1 — Wire docker spawn + DB schema + iframe | ✅ | All in `app/services/module_runtime.py` |
| 1.2 — Vite dev proxy for `/m/<slug>/*` | ✅ | iframe loads in local dev |
| 2.1 — Module logs endpoint + UI | ✅ | `GET /api/admin/modules/:id/logs` + LogsModal |
| 2.2 — Update flow (pull + rebuild + swap) | ✅ | Background task, keeps old on failure |
| 2.3 — Service token rate limit | ✅ | 300 req/min/module via redis bucket |
| 2.4 — Static scan (trivy / semgrep) | ⚠️ deferred | Needs binary on backend image |
| 3.1 — `tenant_modules` table | ✅ | Per-tenant enable/disable |
| 3.2 — Per-module settings | ✅ | jsonb on `admin_modules` + `/api/sdk/settings` |
| 3.3 — Audit log on install/update/uninstall | ✅ | Uses existing audit module |
| 3.4 — Docs hoàn chỉnh | ✅ | This file + `packages/grokflow-module-sdk/docs/` |

### Phase 1 — MVP (2 tuần)

- [ ] `@grokflow/ui` package v0.1 (Button, Modal, Toast, Card, Input, theme.css)
- [ ] Publish `@grokflow/ui` lên npm public
- [ ] Template repo `grokflow-module-sdk` (clone-and-go cho member)
- [ ] Example module `hello-world` chạy end-to-end
- [ ] Migration `0042_module_marketplace.py`
- [ ] Backend `app/modules/admin_modules/` — install + list + uninstall + restart endpoints
- [ ] Backend `app/modules/sdk/` — auth/verify + users/me + tenants/current endpoints
- [ ] Backend `app/services/module_installer.py` — clone + build + spawn logic
- [ ] Backend `app/services/module_db.py` — schema + user creation
- [ ] Frontend `src/modules/admin_modules/` — install form + module list page
- [ ] Frontend sidebar đọc `admin_modules` → inject menu item iframe link
- [ ] Container security baseline

### Phase 2 — Hardening (1 tuần)

- [ ] Static scan (trivy + semgrep) trước install
- [ ] Permission system enforcement
- [ ] Service token rate limit
- [ ] Module log streaming vào core
- [ ] Update flow (zero-downtime swap)
- [ ] Rollback flow

### Phase 3 — Polish (1 tuần)

- [ ] Multi-tenant `tenant_modules` table
- [ ] Module settings UI per-module
- [ ] Audit log của module operations
- [ ] Export/import module bundle
- [ ] Docs hoàn chỉnh + example modules

## Local development workflow

```bash
# Trong nhánh feat/module-marketplace
git checkout feat/module-marketplace

# Backend: alembic migrate
cd backend
alembic upgrade head

# UI package
cd packages/grokflow-ui
npm install
npm run build

# Module SDK template — chạy thử
cd ../grokflow-module-sdk/template
docker compose -f docker-compose.dev.yml up

# Core local
docker compose up
# Truy cập http://localhost:5173/admin/modules
```

KHÔNG push lên staging/prod trong giai đoạn này.
