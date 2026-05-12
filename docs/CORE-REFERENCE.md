# Core Reference

Cheat-sheet of every reusable primitive in `backend/app/core/` and
`frontend/src/core/`. Modules import from here; this layer never imports
from modules.

---

## Backend core

### `app/core/deps.py`

FastAPI dependencies. Use these in handler signatures.

```python
DbSession      = AsyncSession              # from get_db()
CurrentUser    = User                      # any authed user
AdminUser      = User (admin OR super)     # passes for both admin tiers
SuperAdminUser = User (super_admin only)   # global admin gate
ApiKeyPrincipal = (ApiKey, User)           # for public /api/v1 endpoints
```

```python
@router.get("/secret")
async def secret(admin: SuperAdminUser, db: DbSession):
    ...
```

### `app/core/tenant.py`

Multi-tenant helpers. See [MULTI-TENANT.md](./MULTI-TENANT.md).

```python
scope_by_domain(q, domain_column, admin) -> Select
  # Narrow `q` by a domain_id column. Super → no-op.

scope_by_user_domain(q, user_id_column, admin) -> Select
  # Narrow `q` by joining through User.domain_id. For billing rows.

assert_same_domain(admin, row_domain_id) -> None
  # Raise PermissionDenied if row isn't in admin's domain. Super → no-op.

await assert_user_in_admin_domain(db, admin, user_id) -> None
  # Same as above but pulls user_id → users.domain_id first.

await bulk_fetch_map(db, Model, ids: set[UUID]) -> dict[UUID, Model]
  # N+1 antidote. Single SELECT … WHERE id IN (…). Empty input → {}.
```

### `app/core/cache.py`

Redis cache decorator.

```python
@redis_cached(ttl=60, key="domain-config:{host}")
async def get_domain_config(host: str, db: DbSession) -> DomainConfig:
    ...

# Invalidate from writes:
await invalidate("cache:domain-config:flowgrok.vpspanel.io.vn")
await invalidate("cache:domain-config:*")  # glob
```

Cached value: pydantic model → `.model_dump_json()`. Other JSON-able
values get `json.dumps(default=str)`. Anything else → not cached.

### `app/core/security.py`

```python
hash_password(plain: str) -> str
verify_password(plain: str, hashed: str) -> bool
create_access_token(subject: str, extra: dict = None) -> str
decode_access_token(token: str) -> dict | None
hash_api_key(plain: str) -> str
```

### `app/core/database.py`

```python
engine        # AsyncEngine — pool_size=10, max_overflow=20
SessionLocal  # async_sessionmaker
get_db()      # FastAPI dependency, yields AsyncSession
```

### `app/core/redis_client.py`

```python
get_redis() -> redis.asyncio.Redis  # lazy singleton
```

### `app/core/rate_limit.py`

Decorator to rate-limit endpoints — see file docstring.

### `app/core/config.py`

`Settings` object loaded from env via pydantic-settings. Common ones:
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_MINUTES`,
`APP_ENV`, `APP_DEBUG`, `cors_origin_list`.

### `app/core/exceptions.py`

```python
NotFound("user")                # → 404
InvalidPayload("plan không tồn tại")  # → 400
PermissionDenied("Admin required")     # → 403
InvalidCredentials()                   # → 401
EmailAlreadyRegistered()               # → 409
InvalidApiKey()                        # → 401
```

All inherit `AppError` which the global handler renders as
`{"detail": {"code": "...", "message": "..."}}`.

### `app/core/types.py`

`PermissiveEmail` — pydantic email field that accepts non-strict TLDs
(`admin@local` etc.) so legacy accounts validate.

### `app/core/monitoring.py`

`init_sentry()` — call once at app startup. Reads `SENTRY_DSN` from env.

---

## Frontend core

### `core/permissions.ts`

The role/page rules. **Never inline role checks in module code.**

```typescript
export type RoleTier = "super_admin" | "admin" | "user" | "support";

isSuperAdmin(user)              // → boolean
isAnyAdmin(user)                // admin OR super_admin
userCanSeePath(user, path, domainCheck) // → boolean
userHasFeature(user, key)       // entitlement gate
```

`ADMIN_BUILTIN_PATHS = ["/admin/users", "/admin/roles"]` — pages a
per-domain admin can always reach regardless of `domain.allowed_pages`.

### `core/auth/store.ts`

```typescript
useAuthStore — zustand store, persisted to localStorage
  token, user, setAuth, setUser, setEntitlements, clear

User shape:
  id, email, full_name, role,
  domain_id, role_id, role_name,
  effective_allowed_pages,
  entitlements: { plan_code, plan_name, features, limits }

useFeature("ui.api_docs") -> boolean  // admins bypass
useLimit("max_jobs_per_day") -> number // admins → 0 (unlimited)
userCanSeePath              // re-export from core/permissions
```

### `core/api/axios.ts`

The default `api` axios instance — same-origin, JWT injected, 401 →
redirect to /login, error toasts on 4xx/5xx with `detail.message`.

Most calls just `api.get/post/patch/delete(...)`.

### `core/api/factory.ts`

```typescript
createHttp(baseURL: string = "") -> AxiosInstance
```

Build an axios instance with the same interceptors as `api`, but
pointed at `baseURL`. Use in a module's `api.ts` when its BE may move
to a different host:

```typescript
// modules/grok/api.ts
import { createHttp } from "@/core/api/factory";
import { moduleManifest } from ".";
export const grokApi = createHttp(moduleManifest.apiBaseUrl);
```

### `core/domain/store.ts`

```typescript
useDomainStore — zustand store
  config: DomainConfig | null
  loaded: boolean
  load()                       // fetches /api/domains/config?host=...
  isPageAllowed(path)          // path in domain.allowed_pages?
  firstAllowedPath()           // best landing page for current domain
```

Domain config drives sidebar brand name + public-page gates (login /
register / landing). Per-user filtering uses
`user.effective_allowed_pages` instead.

### `core/entitlements/catalog.ts`

```typescript
FEATURE_KEYS = {
  uiApiDocs: "ui.api_docs",
  uiAuditLog: "ui.audit_log",
  uiSettings: "ui.settings",
  // ...
}
```

Use the key (not the string) in `NavLeaf.feature` and `useFeature()`.

### `core/utils/`

Misc helpers — date formatting, byte/number formatters, etc. Add new
small utilities here when they're used by 2+ modules.

---

## App layer (orchestration)

### `app/types.ts`

`FrontendModule`, `ModuleRoute`, `NavLeaf`, `NavGroup`, `NavEntry`. See
[MODULES.md](./MODULES.md).

### `app/moduleRegistry.ts`

```typescript
MODULES                       // ordered list of module manifests
PUBLIC_MODULES                // names mounted outside ProtectedRoute
getAuthedRoutes()
getPublicRoutes()
getAuthedNav()
```

### `app/lazyPage.tsx`

```typescript
lazyPage(loader, exportName) -> ReactElement
```

Wraps `React.lazy(loader)` in `<Suspense>` with a small spinner. Use in
every module route definition so each page becomes its own Vite chunk.

### `app/router.tsx`

`createBrowserRouter` config — just public routes + AppShell +
`getAuthedRoutes()` spread. No per-page imports here.

---

## What goes where

| Need a… | Put it in |
|---|---|
| Reusable BE business logic that's tenant-aware | `app/core/tenant.py` (or extend it) |
| Reusable BE side effect (cache, log, audit) | `app/core/*.py` |
| BE feature endpoint | `app/modules/<feature>/router.py` |
| FE shared helper used by ≥2 modules | `frontend/src/core/<area>/` |
| FE UI primitive (Button, Toast) | `frontend/src/components/ui/` |
| FE layout/guard component | `frontend/src/components/layout/` |
| FE feature page | `frontend/src/modules/<feature>/` |

If you can't decide, ask: "if this product grew a second module, would
it want this code too?" — yes → core; no → module.
