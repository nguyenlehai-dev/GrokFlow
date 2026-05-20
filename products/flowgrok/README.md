# flowgrok

Self-hosted Grok image / video generation gateway.

A multi-tenant SaaS that drives [grok.com](https://grok.com) via a fleet
of headless Chromium profiles, exposing a clean partner-facing API:

```
POST /api/client/generate-image    { prompt, ratio?, count?, reference_images? }
POST /api/client/generate-video    { prompt, ratio?, duration?, count?, reference_images? }
GET  /api/client/status/{task_id}
```

Built on top of FastAPI + React + Playwright + kasmweb VNC. Each Grok
account runs in its own browser-profile container so worker tasks can
drive `grok.com/imagine` programmatically while you log in manually
through a noVNC iframe in the admin UI.

## What you get

- `https://your-domain.com/` — admin UI (profile mgmt, jobs, gallery)
- `https://your-domain.com/api/client/*` — partner API surface
- `https://your-domain.com/api/files/<id>` — public download URL for
  generated outputs (no auth — `file_id` is a UUIDv4 + the secret)
- Auto-rotating workers with per-profile rate-limit awareness
- Job retry across sibling profiles when one Grok account hits quota
- Real-time VNC iframe for manual login + cookie capture

## Deploy from scratch (10 min)

### Server requirements
- 4 vCPU / 8 GB RAM minimum (one Chromium per profile = ~1 GB each)
- Ubuntu 22.04 / Debian 12
- Docker 24+ with Compose plugin
- A domain name you control + DNS A record → server IP
- `/dev/net/tun` available (for WARP proxy bypass of Cloudflare Turnstile)

### One-shot install

```bash
# 1. Clone
git clone https://github.com/nguyenlehai-dev/flowgrok.git
cd flowgrok

# 2. Configure
cp .env.example .env
nano .env   # fill POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, PUBLIC_DOMAIN

# 3. Host nginx + TLS
sudo bash deploy/install_nginx.sh editor.example.com admin@example.com
sudo bash deploy/install_nginx_watcher.sh
sudo bash deploy/install_watcher_keepalive.sh

# 4. Stack
docker compose up -d --build

# 5. Migrate DB + create admin
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.create_admin

# 6. Verify
curl https://editor.example.com/health
# → {"status":"ok","env":"production","version":"..."}
```

Open `https://editor.example.com/`, log in with the admin email, head
to **Profiles**, create your first Grok profile, click **Auto-login**,
sign into Grok in the iframe, and you're ready to submit jobs.

## Partner integration (the simple shape your clients see)

```bash
# Submit
curl -X POST https://editor.example.com/api/client/generate-image \
  -H "Authorization: Bearer uxpm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a sunset over mountains","ratio":"16:9","count":1}'
# → {"task_id":"...","status":"queued","target":"image"}

# Poll
curl https://editor.example.com/api/client/status/<task_id> \
  -H "Authorization: Bearer uxpm_live_xxx"
# → {"status":"success","image_urls":["https://editor.example.com/api/files/<id>"]}

# Download (public — no auth needed, URL is the secret)
curl -O https://editor.example.com/api/files/<id>
```

Token-protected variants (`?token=...` query) still work for private
file types if you need them. See `docs/PARTNER_API.md` for the full
contract (frozen — never changes shape).

## Day-2 operations

| Task | Command |
|------|---------|
| Update to a new release | `git pull && docker compose up -d --build && docker compose exec backend alembic upgrade head` |
| View live logs | `docker compose logs -f backend worker` |
| Tail VNC watchdog | `docker compose logs backend \| grep cdp-watchdog` |
| Backup DB | `docker compose exec postgres pg_dump -U flowgrok > backup-$(date +%F).sql` |
| Restore | `cat backup.sql \| docker compose exec -T postgres psql -U flowgrok` |
| Heal infra (one-click) | Admin UI → Profiles page → "🩺 Heal infra" |

## Architecture (one paragraph)

The backend is a single FastAPI app whose `app/main.py` mounts modules
via `app/core/module_registry.py`. Each module is a folder under
`app/modules/`. The Grok worker (`app/workers/run.py`) polls the DB
for `queued` jobs, picks a free profile, connects to its kasmweb VNC
container over CDP, drives `grok.com/imagine` via Playwright, and
streams the generated assets back to local storage. The partner API
(`app/modules/landing/client_api`) is a thin shim that wraps job
creation and result polling in a clean shape; legacy `/v1/jobs/*`
endpoints are kept for older integrations.

## License & support

- This repo is the property of nguyenlehai-dev. Resale or
  redistribution requires written permission.
- Issues: open a GitHub Issue with the prefix `[flowgrok]`.
- Security: report privately to `security@plxeditor.com`.

## Status

🚧 **Phase A — bootstrap.** Code extracted from the GrokFlow monorepo
but not yet verified to build standalone. See `MIGRATION.md` for the
extraction inventory and the next phases (B: dependency cleanup,
C: deploy verify, D: handoff docs).
