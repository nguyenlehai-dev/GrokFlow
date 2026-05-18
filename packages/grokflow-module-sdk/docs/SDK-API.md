# GrokFlow Module SDK — API reference

Every endpoint below is exposed by core at `${GROKFLOW_API_URL}/...`
(default `http://backend:8000/api/sdk` inside the docker network). Each
call MUST send:

| Header | Value |
|---|---|
| `X-GrokFlow-Service-Token` | Injected as `GROKFLOW_SERVICE_TOKEN` env var |
| `X-GrokFlow-User-Token` | The user's JWT (forwarded from the iframe URL `?token=...`) |

Calls without the service token → 401. Calls with a service token whose
module is not `status=running` → 403. Calls that exceed 300 req/min per
module → 429.

## POST /auth/verify

Verify the user JWT is still valid + return identity.

**Response 200:**
```json
{ "user_id": "uuid", "email": "...", "role": "super_admin|admin|user|support", "tenant_id": null }
```

## GET /users/me

Same shape as verify but a GET for convenience.

## GET /tenants/current

Return the tenant context for the acting user.

**Response 200:**
```json
{ "tenant_id": "uuid|null", "hostname": "...|null", "label": "...|null" }
```

## GET /settings

Return THIS module's settings blob (as set by admin via
`/api/admin/modules/<id>/settings`).

**Response 200:** arbitrary JSON object.

---

## Permission scopes

When you declare scopes in `module.manifest.json → permissions.scopes`,
core enforces them at install. Currently honored:

| Scope | What it unlocks |
|---|---|
| `write:audit_log` | (planned) POST /audit/log |
| `send:notification` | (planned) POST /notifications/send |
| `read:user` | implicit, no scope needed |
| `read:tenant` | implicit |

Modules must NOT pretend to have a scope they didn't declare — core
checks the manifest at every call.

## Rate limit

Per-module fixed window: 300 requests / minute on /api/sdk/*. Hitting
the cap returns 429. Future: per-scope limits.
