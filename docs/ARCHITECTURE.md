# GrokFlow — Architecture

Living guide to the codebase. Updated alongside major refactors.

## 1. 10-second pitch

Multi-tenant SaaS platform built on:

- **Backend**: FastAPI (async SQLAlchemy + Postgres + Redis).
- **Frontend**: React + Vite + TanStack Query + zustand.
- **Infra**: Docker Compose on a VPS, host nginx for TLS + per-domain
  vhosts, gunicorn+uvicorn for the API, nginx-static for the FE bundle.

Three role tiers (`super_admin` / `admin` / `user`), per-domain scoping
on every tenant resource (users, gateway keys, requests), and a module
system so each menu group is a self-contained slice that can later live
in its own git repo.

## 2. Repo layout

```
GrokFlow/
├─ backend/
│  ├─ app/
│  │  ├─ core/                 ← shared primitives (auth, db, cache, tenant)
│  │  ├─ models/               ← SQLAlchemy ORM (single file today)
│  │  ├─ modules/              ← one folder per feature area
│  │  │  ├─ admin/             ← users / plans / domains / billing CRUD
│  │  │  ├─ auth/              ← login / register / me
│  │  │  ├─ gateway/           ← LLM gateway (vendors / pools / keys / requests)
│  │  │  ├─ roles/             ← per-domain named roles
│  │  │  ├─ domains/           ← public domain config + admin CRUD
│  │  │  └─ …
│  │  ├─ services/             ← cross-cutting infra (nginx_sync, …)
│  │  ├─ workers/              ← redis queue consumer + idle-cleanup
│  │  └─ main.py               ← FastAPI app + router mounting
│  ├─ alembic/versions/        ← every schema change ships as a numbered migration
│  └─ Dockerfile.prod          ← multi-stage prod image (gunicorn + uvicorn)
│
├─ frontend/
│  ├─ src/
│  │  ├─ core/                 ← shared client primitives
│  │  │  ├─ api/               ← axios instance + factory
│  │  │  ├─ auth/              ← JWT store + user
│  │  │  ├─ domain/            ← per-host config store
│  │  │  ├─ entitlements/      ← plan feature catalog
│  │  │  └─ permissions.ts     ← role / page-access rules
│  │  ├─ app/
│  │  │  ├─ types.ts           ← FrontendModule interface
│  │  │  ├─ moduleRegistry.ts  ← list of mounted modules
│  │  │  ├─ router.tsx         ← builds routes from registry
│  │  │  └─ lazyPage.tsx       ← React.lazy + Suspense helper
│  │  ├─ components/           ← shared UI + AppShell + guards
│  │  └─ modules/              ← one folder per menu group
│  │     ├─ admin/             ← dashboard / api-keys / users / roles / …
│  │     ├─ auth/              ← login / register
│  │     ├─ landing/           ← public marketing
│  │     ├─ grok/              ← profiles / jobs / api-docs
│  │     ├─ flow/              ← video tools
│  │     └─ gateway/           ← LLM gateway pages
│  └─ Dockerfile.prod          ← multi-stage: build → nginx-static
│
├─ docs/                       ← this folder
├─ docker-compose.yml          ← local dev
├─ docker-compose.intranet.yml ← VPS prod stack (the active one)
└─ .claude/skills/             ← project-scoped Claude Code skills
```

## 3. Layered design

```
                  ┌─────────────────────────────────────────────┐
                  │              MODULES (features)             │
                  │  admin · grok · flow · gateway · landing …  │
                  └────────────────────┬────────────────────────┘
                                       │ uses
                  ┌────────────────────▼────────────────────────┐
                  │            CORE (shared primitives)         │
                  │                                             │
                  │  Backend                                    │
                  │    deps · security · tenant · cache · db    │
                  │                                             │
                  │  Frontend                                   │
                  │    permissions · auth · domain · http       │
                  └─────────────────────────────────────────────┘
```

The contract is one-way: **modules import from core, core never imports
from modules**. Adding a new module never touches core; refactoring core
never breaks a specific module's API surface (only its internals).

## 4. Multi-tenant model

See **[MULTI-TENANT.md](./MULTI-TENANT.md)** for the full rules. Quick
mental model:

- Every tenant is a `Domain` row (hostname-keyed, e.g.
  `gateways.plxeditor.com`).
- A `User` belongs to one Domain via `users.domain_id` (NULL = global /
  super_admin).
- Tenant-scoped resources (`gw_gateway_keys`, `gw_requests`) carry their
  own `domain_id` column; queries are narrowed via `scope_by_domain()`.
- Billing rows (`subscriptions`, `payments`, `invoices`) don't carry
  `domain_id` — they're narrowed via `scope_by_user_domain()` through
  the user FK.
- A `Role` is a named permission subset within a domain
  (`Role.allowed_pages ⊆ Domain.allowed_pages`). Users with `role_id`
  see `effective_allowed_pages = role.allowed_pages ∩ domain.allowed_pages`.

## 5. Module system (frontend)

See **[MODULES.md](./MODULES.md)** for adding/extending modules.

Each module owns:
- `routes[]` — react-router child routes mounted under `/`
- `nav[]` — sidebar entries (the post-login AppShell builds from these)
- `apiBaseUrl` — optional remote BE URL (env-overridable)

`app/router.tsx` and `components/layout/AppShell.tsx` both call
`getAuthedRoutes()` / `getAuthedNav()` from the registry — adding a new
module is a 2-line change in `moduleRegistry.ts`.

## 6. Request lifecycle (a representative path)

`GET /gateway/dashboard` while logged in as a per-domain admin:

1. Browser hits `flowgrok.vpspanel.io.vn/gateway/dashboard`.
2. **Host nginx vhost** routes `/api/*` → `127.0.0.1:8000` (backend
   container), everything else → `127.0.0.1:5173` (frontend nginx
   serving the static bundle).
3. React loads → `ProtectedRoute` calls `/api/auth/me` → backend returns
   the user + `effective_allowed_pages` (already intersected).
4. AppShell builds the sidebar from `moduleRegistry.getAuthedNav()`,
   filters with `userCanSeePath(user, path, isPageAllowed)`.
5. The user clicks Gateway → Dashboard. The route is mounted lazily via
   `lazyPage(() => import("./GatewayDashboardPage"))` → Vite fetches the
   per-page chunk only now.
6. `GatewayDashboardPage` calls `/api/v1/gateway/dashboard` via `gwApi`.
7. Backend `require_admin` dep authorizes; `scope_by_domain()` narrows
   the count queries to the admin's `domain_id`.
8. Response renders.

## 7. Hot-path optimizations applied

- **N+1 elimination**: every list endpoint that needs related entities
  uses `bulk_fetch_map()` from `core/tenant.py` — one IN-list query
  per related table, dict-lookup in Python.
- **Redis cache**: `/api/domains/config` (60s TTL), `/api/plans/public`
  (300s TTL). Cache busted on admin write via `invalidate()`.
- **Composite indexes** (alembic 0015):
  - `gw_requests (domain_id, created_at DESC)`
  - `payments (status, paid_at)`
  - `gw_pool_api_keys (pool_id) WHERE status='active'`
- **DB pool**: `pool_size=10, max_overflow=20, pool_pre_ping=True,
  pool_recycle=1800s` per worker.
- **FE code-split**: every authed page is its own Vite chunk via
  `lazyPage()`.

## 8. Where to dig in

| If you want to… | Read |
|---|---|
| Add a new menu group | [MODULES.md](./MODULES.md) |
| Understand permissions | [MULTI-TENANT.md](./MULTI-TENANT.md) |
| Tune cache / pool / workers | [PERFORMANCE.md](./PERFORMANCE.md) |
| Deploy a change | [QUY-TRINH-DEPLOY.md](./QUY-TRINH-DEPLOY.md) |
| Manage plans / entitlements | [PLANS-ENTITLEMENTS.md](./PLANS-ENTITLEMENTS.md) |
