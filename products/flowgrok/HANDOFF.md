# flowgrok — Handoff Procedure

This document describes how to take this repo from "code committed in
the monorepo" to "deployed standalone product running on a customer
VPS." It assumes you (the maintainer) and the customer (the buyer).

## What's in this repo

A complete, standalone Grok image+video gateway product:
- Backend: FastAPI app with 17 modules, 132 routes
- Frontend: React SPA with admin shell + Grok product views
- Operations: docker-compose stack, host nginx scripts, WARP watchdog,
  CDP health monitor, profile management UI
- Partner API: 3 frozen endpoints (`/api/client/generate-image|video|status`)
  and one public download path (`/api/files/<id>`)

## Step 1: Move from monorepo to its own GitHub repo

```bash
# In your monorepo working tree
cd ~/GrokFlow
git subtree split --prefix=standalone/flowgrok -b flowgrok-split

# Create the new repo on GitHub first (private), then:
cd /tmp
git clone <empty-new-repo-url> flowgrok-standalone
cd flowgrok-standalone
git pull /path/to/GrokFlow flowgrok-split
git push -u origin main
```

After the first push, future updates can be pushed via:
```bash
cd ~/GrokFlow
git subtree push --prefix=standalone/flowgrok flowgrok-mirror main
```

…where `flowgrok-mirror` is a remote pointing at the new repo.

## Step 2: Hand the customer GitHub access

- Add their GitHub account as a `read` collaborator on the new repo
- Generate a fine-grained PAT scoped to `packages:read` for pulling
  the (future) shared `grokflow-core` package from GitHub Packages
- Send them the PAT + a copy of this `HANDOFF.md`

## Step 3: Customer deploys (their side)

```bash
# 1. Provision VPS — 4 vCPU, 8 GB RAM, Ubuntu 22.04, /dev/net/tun available
ssh root@their-vps
curl -fsSL https://get.docker.com | sh

# 2. Clone (read-only token works fine)
git clone https://github.com/their-org/flowgrok.git
cd flowgrok

# 3. Configure
cp .env.example .env
nano .env   # POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, PUBLIC_DOMAIN

# 4. Host nginx + TLS + watchdog
sudo bash deploy/install_nginx.sh editor.theircompany.com admin@their.com
sudo bash deploy/install_nginx_watcher.sh
sudo bash deploy/install_watcher_keepalive.sh
sudo bash deploy/install_warp_proxy.sh     # if grok.com Cloudflare bypass needed
sudo bash deploy/install_warp_watchdog.sh

# 5. Bring up the stack
docker compose up -d --build

# 6. DB + admin
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.create_admin

# 7. Open browser
open https://editor.theircompany.com/
```

Expected time: 15–30 min including Cloudflare DNS propagation.

## Step 4: Customer onboarding

Walk the customer through:

1. **Create the first Grok profile.** Admin → Profiles → New →
   pick a `tier` (free/pro/super_grok/super_grok_heavy).
2. **Auto-login.** Click "Auto-login" on the row → the noVNC iframe
   loads → sign into grok.com inside the iframe → click "Finish Login"
   → profile status flips to `logged_in`.
3. **Mint API keys for partners.** Admin → API Keys → Create. Hand
   the `uxpm_live_*` key to whoever's integrating.
4. **Test the partner contract:**
   ```bash
   curl -X POST https://editor.theircompany.com/api/client/generate-image \
     -H "Authorization: Bearer uxpm_live_xxx" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"a cat in space","ratio":"1:1","count":1}'
   ```

## Step 5: Ongoing support model

| Topic | Owner |
|-------|-------|
| OS / docker patching | Customer |
| VPS uptime / backup | Customer |
| Grok account quotas | Customer |
| Code updates | You — published as new git tags on the repo |
| Security patches | You — communicated via GitHub issues |
| Schema migrations | You — added as new alembic files; `docker compose exec backend alembic upgrade head` on customer side |
| Bug reports | Customer files GitHub issue, you respond |

For the first 30 days post-handoff offer "white-glove" support — be
willing to ssh in (with their consent) to debug live. After that,
async-only via the issue tracker.

## Step 6: License terms

Recommend including in the repo (NOT in this handoff doc — that's
just guidance for you):

- The customer may run unlimited deploys on infrastructure they own
- They may NOT resell, sublicense, or redistribute the source
- They may NOT remove copyright headers
- The shared `grokflow-core` package (when extracted) is under the
  same terms — read-only access via GitHub Packages, no fork
- Security issues: disclose privately to `security@plxeditor.com`
  before publishing

Bundle a `LICENSE.txt` with the actual legal text — talk to a lawyer
first if you're selling to enterprise.

## What's still unfinished (Phase C+ work)

This handoff doc is intentionally optimistic — the actual repo still
has these rough edges:

- **Build verification**: `docker compose build` has been run locally
  but a clean-room build on a fresh customer VPS hasn't been smoke
  tested end-to-end. Bake in 1 day for first-deploy debug.
- **Alembic migration cleanup**: 43 migrations were copied wholesale,
  including some for tables this product doesn't expose (Flow,
  Gateway, Servers, Tool). They CREATE empty tables; safe but
  cluttered. Future polish: collapse into a single fresh-baseline
  migration once a customer has been bootstrapped.
- **VNC stack assumptions**: assumes `/etc/nginx/grokflow-vhosts/`
  exists + writable by gid 10001. The install_nginx.sh script
  creates it but if a customer hand-rolls their nginx config, this
  needs documenting.
- **Shared `grokflow-core` package**: not yet extracted. The
  shared modules (auth, admin, files, users, entitlements) are
  vendored directly into this repo. Phase B-future will extract
  them to a private package so updates can be pushed once instead
  of 3× (once per product repo).
