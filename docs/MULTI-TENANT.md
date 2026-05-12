# Multi-tenant Permission Model

The system serves multiple tenants from a single deploy. Each tenant is
a **Domain** (hostname-keyed), and almost every authed API + page is
scoped to "the caller's domain" unless the caller is a super_admin.

## Three role tiers

| Tier         | Scope             | Sees |
|--------------|-------------------|------|
| `super_admin`| Global            | Everything across all domains. Manages plans, vendors, pools, every tenant's users and billing. |
| `admin`      | One domain        | Their own tenant's users, gateway keys, requests, billing. Can also read (not edit) global provider config. |
| `user`       | One domain + role | Only the pages in `role.allowed_pages ∩ domain.allowed_pages`. |
| `support`    | One domain + role | Same as `user` (legacy tier). |

## The schema

```
domains
  id              uuid
  hostname        text unique           ← "gateways.plxeditor.com" or "*"
  allow_all_pages bool
  allowed_pages   jsonb                 ← ["/dashboard", "/gateway/playground"]
  allow_landing   bool                  ← gates public /landing
  allow_register  bool                  ← gates public /register
  allow_login     bool                  ← gates public /login
  brand_name      text                  ← UI rebrand for the host

roles                                   ← per-domain named permission set
  id              uuid
  domain_id       uuid → domains
  name            text                  ← "Khách", "Manager"
  allowed_pages   jsonb                 ← ⊆ domain.allowed_pages
  UNIQUE (domain_id, name)

users
  id              uuid
  email           text unique
  role            text                  ← 'super_admin' | 'admin' | 'user' | 'support'
  domain_id       uuid → domains nullable
  role_id         uuid → roles nullable

gw_gateway_keys                         ← tenant-scoped resource
  …
  domain_id       uuid → domains nullable

gw_requests                             ← tenant-scoped audit log
  …
  domain_id       uuid → domains nullable
```

## Resolution rules

### Domain lookup (per-host)

When the browser hits `gateways.plxeditor.com`, the FE calls
`GET /api/domains/config?host=gateways.plxeditor.com`. Backend:

1. Look up exact match `WHERE hostname = 'gateways.plxeditor.com'`.
2. Fall back to wildcard row `WHERE hostname = '*'`.
3. Fail-open default (`allow_all_pages=true`) if even `*` is missing.

The frontend stores the config in `useDomainStore` and uses it for:
- Sidebar menu visibility
- Brand name in header
- Public-page gates (login / register / landing)

### Effective allowed_pages per user (the FE menu filter input)

Computed by `/api/auth/me`:

```python
if user.role == "super_admin":
    effective_pages = None              # no restriction
elif user.role == "admin":
    effective_pages = domain.allowed_pages
elif user.role_id:
    effective_pages = role.allowed_pages ∩ domain.allowed_pages
else:  # user/support with no per-domain role
    effective_pages = domain.allowed_pages
```

Returned as `MeResponse.effective_allowed_pages`. The FE
`userCanSeePath()` in `core/permissions.ts` consumes this; modules never
recompute it.

### Backend authorization on each route

Two FastAPI dependencies:

- `AdminUser` — accepts `admin` OR `super_admin`.
- `SuperAdminUser` — accepts only `super_admin`.

The route picks the tighter one:

```python
@router.get("/api/admin/plans")
async def list_plans(_admin: AdminUser, db: DbSession):
    # any admin tier can read the plan catalog
    ...

@router.delete("/api/admin/plans/{plan_id}")
async def delete_plan(plan_id: UUID, admin: SuperAdminUser, db: DbSession):
    # only super_admin can delete a plan
    ...
```

### Per-tenant scoping inside a route

`app/core/tenant.py` exports the helpers every per-tenant CRUD uses:

```python
from app.core.tenant import (
    scope_by_domain,         # narrow query by a domain_id column on the row
    scope_by_user_domain,    # narrow query by domain through a User FK
    assert_same_domain,      # single-row guard (row has domain_id)
    assert_user_in_admin_domain,  # single-row guard (row.user_id → users.domain_id)
    bulk_fetch_map,          # N+1 antidote: SELECT … WHERE id IN (…)
)
```

#### Pattern A: row carries `domain_id` directly

```python
@router.get("/gateway-keys")
async def list_gateway_keys(admin: AdminUser, db: DbSession):
    q = scope_by_domain(
        select(GwGatewayKey).order_by(GwGatewayKey.created_at.desc()),
        GwGatewayKey.domain_id,
        admin,
    )
    return list((await db.execute(q)).scalars().all())

@router.delete("/gateway-keys/{key_id}")
async def revoke_gateway_key(key_id: UUID, admin: AdminUser, db: DbSession):
    k = await db.get(GwGatewayKey, key_id)
    if not k:
        raise NotFound("gateway_key")
    assert_same_domain(admin, k.domain_id)
    await db.delete(k)
```

#### Pattern B: row joins to User via `user_id`

For billing tables that don't carry `domain_id`:

```python
@router.get("/subscriptions")
async def list_subscriptions(admin: AdminUser, db: DbSession):
    q = scope_by_user_domain(select(Subscription), Subscription.user_id, admin)
    rows = list((await db.execute(q)).scalars().all())
    return await _subs_to_out(db, rows)

@router.patch("/subscriptions/{subscription_id}")
async def update_subscription(subscription_id: UUID, ..., admin: AdminUser, db):
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await assert_user_in_admin_domain(db, admin, sub.user_id)
    ...
```

## Sign-up flow

`POST /api/auth/register` reads the `Host` header (set by nginx via
`proxy_set_header Host $host`) → resolves to a `Domain` → stores
`user.domain_id`. New users automatically belong to the tenant they
signed up from. `role` defaults to `"user"`.

`*` wildcard signups get `domain_id = NULL` (visible only to super_admin
until later assignment).

## Gateway clients (external API callers)

The LLM gateway accepts EITHER:

- A GrokFlow admin JWT (super_admin only, for super to test the gateway), OR
- A `gwk_live_*` key (issued via `/api/v1/gateway/gateway-keys`).

Each gateway key has its own `domain_id`. `auth.require_caller` resolves
that into a `GatewayCaller { domain_id }` which gets stamped onto every
`GwRequest` row. The Requests admin page filters by that.

## How to verify scoping is correct

1. As `super_admin`, list rows — you should see everything.
2. As a domain admin, list the same endpoint — only your domain's rows.
3. As a domain admin, try to PATCH a row from another domain by ID —
   expect `PermissionDenied` ("Bản ghi không thuộc domain bạn quản lý").

When adding a new tenant-scoped endpoint, write a quick smoke test that
asserts #2 and #3 — it's the easiest way to catch a missing
`scope_by_domain` / `assert_same_domain` call.
