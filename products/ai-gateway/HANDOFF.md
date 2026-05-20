# ai-gateway — Handoff Procedure

Standalone multi-LLM API gateway carved out of the GrokFlow monorepo.
Provider routing across OpenAI / Anthropic / Gemini / Replicate /
Grok, with admin shell + billing + API key auth. **No browser
automation** — that lives in `flowgrok`.

## What's in this repo

- Backend: FastAPI app — 127 routes, 14 modules
- Frontend: React SPA with admin shell + Gateway product views
- Operations: docker-compose stack, host nginx, deploy scripts
- API surface: `/api/v1/gateway/*` (pools, keys, vendors, requests,
  uploads, execute, functions)

## Step 1: Move from monorepo to its own GitHub repo

```bash
# In the GrokFlow monorepo
cd ~/GrokFlow
git subtree split --prefix=standalone/ai-gateway -b aigateway-split

# Push to the new private repo
cd /tmp
git clone <empty-new-repo-url> ai-gateway
cd ai-gateway
git pull /path/to/GrokFlow aigateway-split
git push -u origin main
```

For future syncs from the monorepo:

```bash
cd ~/GrokFlow
git subtree push --prefix=standalone/ai-gateway aigateway-mirror main
```

## Step 2: Customer-side deploy

```bash
# 1. Provision VPS — 2 vCPU + 4 GB RAM is plenty (no chromium runtime)
ssh root@their-vps
curl -fsSL https://get.docker.com | sh

# 2. Clone (read-only PAT works)
git clone https://github.com/their-org/ai-gateway.git
cd ai-gateway

# 3. Configure
cp .env.example .env
nano .env   # POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, PUBLIC_DOMAIN

# 4. Host nginx + TLS
sudo bash deploy/install_nginx.sh gw.theircompany.com admin@their.com

# 5. Bring up the stack
docker compose up -d --build

# 6. DB + admin
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.create_admin

# 7. Open browser
open https://gw.theircompany.com/
```

Expected first-deploy time: 15–20 minutes.

## Step 3: Customer onboarding

1. **Add vendor credentials.** Admin → Gateway → Vendors → for each
   provider (OpenAI / Anthropic / etc.) paste their API key. Encrypted
   with ENCRYPTION_KEY at rest.
2. **Create pools.** Gateway → Pools → choose vendors + models +
   priority/weighting. A pool is what the gateway routes against.
3. **Mint gateway keys.** Gateway → Gateway Keys → Create. Hand the
   resulting `gwk_*` key to whoever is integrating.
4. **Test:**
   ```bash
   curl https://gw.theircompany.com/api/v1/gateway/execute \
     -H "Authorization: Bearer gwk_xxx" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
   ```

## Step 4: Ongoing support model

Same as flowgrok — see `flowgrok/HANDOFF.md` Step 5. Customer owns
OS/docker patching + uptime + provider quotas; you ship code updates
+ schema migrations.

## Step 5: License

Bundled `LICENSE.txt` is a template — talk to a lawyer before any
enterprise sale. Same proprietary terms as flowgrok.

## What's still unfinished (Phase C+ work)

- **Build verification**: `docker compose up` hasn't been smoke-tested
  on a clean VPS yet. Backend imports clean (`python -c 'from app.main
  import app'` → 127 routes). Bake in 1 day for first-deploy debug.
- **Alembic migration cleanup**: 43 migrations copied wholesale. Some
  create empty Grok / Flow tables; safe but cluttered. Future polish:
  collapse into a single fresh-baseline migration.
- **Dashboard panels**: the admin dashboard reuses the GrokFlow shape
  but only fills the gateway-relevant counters. Profile / Job / Flow
  panels are zero-padded for FE compat — could be redesigned to be
  gateway-native.
- **Shared `grokflow-core` package**: not yet extracted. The shared
  modules (auth, admin, billing, files, entitlements) are vendored
  directly — three copies across the three standalone products.
  Phase B-future will extract them to a private package so updates
  can be pushed once instead of 3×.
