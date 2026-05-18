# GrokFlow Module SDK

Template + contract for third-party modules that plug into GrokFlow via
the iframe + service-token marketplace.

**Member workflow:**

```bash
# 1. Clone this template, rename for your module
git clone https://github.com/yourorg/grokflow-module-sdk my-invoice
cd my-invoice/template
# Update module.manifest.json with your name, version, menu label

# 2. Test local with the mock core
docker compose -f docker-compose.dev.yml up
# Open http://localhost:5173 — your module runs against a fake core that
# returns a stub user + auth verify

# 3. Push to your own repo
git remote set-url origin https://github.com/myaccount/my-invoice
git push

# 4. Send the URL to the GrokFlow admin → they paste it in /admin/modules
# Within ~60s your module appears in the admin sidebar
```

## What the contract requires

Every module repo MUST contain at its root:

```
my-module/
├── module.manifest.json         # Required — schema below
├── frontend/Dockerfile          # Required — builds an nginx-served SPA
├── backend/Dockerfile           # Required — runs FastAPI on the port in manifest
└── README.md                    # Recommended
```

See `template/` for a hello-world starter that ticks every box.

## Manifest reference

See [`docs/MANIFEST.md`](docs/MANIFEST.md).

## SDK API reference

Core exposes these endpoints for your BE to call back (auth via the
`GROKFLOW_SERVICE_TOKEN` env var that core injects at spawn):

| Endpoint | Purpose |
|---|---|
| `POST /api/sdk/auth/verify` | Verify a user JWT (from the iframe URL) |
| `GET  /api/sdk/users/me` | Get info of the user currently using the module |
| `GET  /api/sdk/tenants/current` | Tenant context |

See [`docs/SDK-API.md`](docs/SDK-API.md) for headers + payload schemas.

## Security policy

Your module container runs hardened:
- `cap_drop=ALL`, no privileged, no docker socket
- read-only filesystem (writes go to a small `/tmp` tmpfs)
- memory + CPU caps from manifest
- network limited to the GrokFlow docker bridge
- can only see its own postgres schema (`mod_<slug>`)

If your module needs to escape any of these (e.g. shell-out, network
egress to a specific host), declare it in `manifest.permissions.scopes`
and the admin will see + approve at install.
