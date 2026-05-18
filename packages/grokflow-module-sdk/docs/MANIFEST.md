# module.manifest.json schema

Authoritative reference for module authors. Core validates against this
JSON schema at install time — non-conforming repos get a 422.

```json
{
  "$schema": "https://grokflow.dev/schemas/module-v1.json",
  "name": "invoice",                  // [a-z][a-z0-9_]{2,30} — slug
  "version": "1.0.0",                 // semver
  "author": "github-username",
  "description": "What the module does",

  "menu": {
    "label": "Hoá đơn",               // shown in admin sidebar
    "icon": "FileText",               // lucide-react icon name
    "order": 100,
    "group": "Business"
  },

  "frontend": {
    "dockerfile": "frontend/Dockerfile",
    "port": 80,                       // port FE container exposes
    "build_args": {
      "VITE_APP_NAME": "Invoice"
    }
  },

  "backend": {
    "dockerfile": "backend/Dockerfile",
    "port": 8000,
    "health_path": "/health",
    "startup_command": "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0"
  },

  "database": {
    "schema": "mod_invoice",          // postgres schema owned by the module
    "read_core_tables": ["users", "domains"]  // additional SELECT grants
  },

  "permissions": {
    "scopes": ["read:user", "write:audit_log"]
  },

  "resources": {
    "memory": "512m",                 // bytes, suffix m (MB) or g (GB)
    "cpus": 0.5                       // fractional CPU (1.0 = 1 vCPU)
  }
}
```

## Caps enforced by core

- `resources.memory` ≤ 2g
- `resources.cpus` ≤ 2.0
- `name` must match `^[a-z][a-z0-9_]{2,30}$`
- `database.schema` must match `name` prefix `mod_<name>` or be exactly `mod_<name>`

## Auto-injected at runtime

The values you provide are merged with these env vars core injects when
spawning your module's containers:

### Backend container
- `MODULE_DB_URL` — Postgres DSN scoped to `database.schema`
- `GROKFLOW_API_URL` — base URL for SDK callbacks
- `GROKFLOW_SERVICE_TOKEN` — your module's identity token
- `MODULE_SLUG` — your module's slug

### Frontend container (build args)
- `VITE_MODULE_API_BASE` — `/m/<slug>/api`
- `VITE_GROKFLOW_API` — `/api/sdk`
