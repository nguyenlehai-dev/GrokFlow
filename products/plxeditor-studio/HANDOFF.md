# plxeditor-studio — Handoff Procedure

Branded all-in-one editor: Grok image/video generation + Flow
video post-processing, bundled under one admin shell. The flagship
product for plxeditor.com — flowgrok is the API-first slimdown,
ai-gateway is the LLM router. This is the customer-facing app.

## What's in this repo

- Backend: FastAPI app — 143 routes, 19 modules
- Frontend: React SPA with admin shell + Grok + Flow product views
- Operations: docker-compose stack, host nginx, deploy scripts, WARP
  watchdog, CDP health monitor
- API surface:
  - Grok: `/api/profiles`, `/api/jobs`, `/api/grok-projects`
  - Flow: `/api/flow/*` (cut, merge, extract-audio, ...)
  - Partner: `/api/client/generate-image|video|status`
  - Public download: `/api/files/<id>`

## Step 1: Move from monorepo to its own GitHub repo

```bash
cd ~/GrokFlow
git subtree split --prefix=standalone/plxeditor-studio -b plxeditor-split

cd /tmp
git clone <empty-new-repo-url> plxeditor-studio
cd plxeditor-studio
git pull /path/to/GrokFlow plxeditor-split
git push -u origin main
```

For future syncs:

```bash
cd ~/GrokFlow
git subtree push --prefix=standalone/plxeditor-studio plxeditor-mirror main
```

## Step 2: Customer-side deploy

Identical to flowgrok — see `flowgrok/HANDOFF.md` Step 3. The stack
needs the same Linux VPS prerequisites (`/dev/net/tun`, docker.sock
mount, `/etc/nginx/grokflow-vhosts/` writable by gid 10001).

```bash
# 1. Provision VPS — 4 vCPU + 8 GB RAM, Ubuntu 22.04
ssh root@their-vps
curl -fsSL https://get.docker.com | sh

# 2. Clone
git clone https://github.com/their-org/plxeditor-studio.git
cd plxeditor-studio

# 3. Configure
cp .env.example .env
nano .env

# 4. Host nginx + TLS + watchdog
sudo bash deploy/install_nginx.sh studio.theircompany.com admin@their.com
sudo bash deploy/install_nginx_watcher.sh
sudo bash deploy/install_watcher_keepalive.sh
sudo bash deploy/install_warp_proxy.sh
sudo bash deploy/install_warp_watchdog.sh

# 5. Bring up
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.create_admin
```

Expected first-deploy time: 20–30 minutes (Chromium image pull).

## Step 3: Customer onboarding

Walk customer through:

1. **Create the first Grok profile.** Admin → Profiles → New →
   tier → Auto-login → noVNC handshake → "Finish Login".
2. **Try Flow.** Tools → Flow → upload a clip → cut/merge/etc.
   No login workflow required — Flow is FFmpeg-only, runs server-side.
3. **Mint API keys.** Admin → API Keys → Create. Same partner
   surface as flowgrok (`/api/client/generate-image|video|status`).

## Step 4: License

Bundled `LICENSE.txt` is a template — same proprietary terms as
flowgrok / ai-gateway. Talk to a lawyer before enterprise sale.

## What's still unfinished (Phase C+ work)

- **Build verification**: `docker compose build` hasn't been smoke
  tested on a clean VPS yet. Backend imports clean (`python -c 'from
  app.main import app'` → 143 routes / 19 modules). Bake in 1 day
  for first-deploy debug.
- **Dashboard Gateway panel**: the `Gateway LLM` group is hardcoded
  to empty since plxeditor-studio doesn't ship the gateway. Tidy:
  remove the empty group entirely instead of zero-padding.
- **Gallery `/api/admin/gallery/gateway` endpoint** returns empty
  page hardcoded. Could be removed from the FE menu.
- **Alembic migration cleanup**: 43 migrations copied wholesale —
  some create Gateway / Servers tables this product never reads.
  Future polish: fresh-baseline migration squash.
- **Shared `grokflow-core` package**: not yet extracted — same as
  flowgrok / ai-gateway. Three copies of auth/admin/billing across
  the three standalone products. Phase B-future will extract them.
