# Branching & Deploy Workflow

GrokFlow uses **3 branches** mapped to **3 environments**, plus an
auto-deploy daemon on the VPS that polls `prod` and ships changes
within ~1 minute of a push.

## Branches

| Branch | Purpose | Auto-deploy? | Stability |
|---|---|---|---|
| `dev` | Daily development. Push frequently. | No | Unstable, may break |
| `staging` | Pre-prod gate. QA / smoke-test before merging to prod. | **Yes — VPS polls every 1 min** (separate env on same VPS) | Should be working |
| `prod` | Live site. Every commit is deployed. | **Yes — VPS polls every 1 min** | Must be working |

`prod` is **protected** logically: only fast-forward merges from `dev` after
review. Never push directly.

## Daily flow — single developer

```
┌─────────────┐    work        ┌─────────┐  PR / merge  ┌──────────┐  cron pull  ┌─────────┐
│ local dev   │ ─────────────▶ │  dev    │ ───────────▶ │   prod   │ ──────────▶ │  VPS    │
│ (any        │   git push      │ branch  │              │  branch  │  every 1m   │  live   │
│  machine)   │                 │ origin  │              │  origin  │             │  site   │
└─────────────┘                 └─────────┘              └──────────┘             └─────────┘
```

1. **Code on `dev`.** Branch is messy by design — push every commit.
   ```bash
   git checkout dev
   # ... edit ...
   git add -A && git commit -m "feat: ..."
   git push origin dev
   ```

2. **Local sanity check.** When the work is ready to ship, locally:
   ```bash
   pytest backend/tests -q
   cd frontend && npm run build && cd ..
   ```
   (CI on GitHub also runs these on every dev push — see
   `.github/workflows/ci.yml`. Wait for the green check before merging.)

3. **Merge `dev` → `prod`.** Use a fast-forward merge so prod history
   stays linear.
   ```bash
   git checkout prod
   git pull --ff-only origin prod
   git merge --ff-only dev
   git push origin prod
   ```
   If the FF merge fails (someone else pushed to prod), rebase dev
   onto prod first:
   ```bash
   git checkout dev
   git rebase origin/prod
   git push --force-with-lease origin dev
   ```
   Then re-run step 3.

4. **Watch the auto-deploy.** Within 60 seconds the VPS cron picks it up.
   - SSH to VPS: `tail -f /var/log/grokflow-deploy.log`
   - Or open https://flowgrok.vpspanel.io.vn — the new commit should
     be live.

## Daily flow — working from a different machine

The whole point: any machine that can `git push` can ship to prod.

```bash
# On the new machine, first time:
git clone https://github.com/nguyenlehai-dev/GrokFlow.git
cd GrokFlow
git checkout dev

# Then work as usual (steps 1-4 above).
```

No SSH key to the VPS needed. The VPS polls GitHub on its own.

## VPS auto-deploy daemon — how it works

The daemon is a single bash script run by `cron` every minute, parametrised
by branch ([`deploy/auto_deploy.sh`](../deploy/auto_deploy.sh)):

```
* * * * * /home/vpsroot/grokflow/deploy/auto_deploy.sh prod    >> /home/vpsroot/grokflow-deploy.log 2>&1
* * * * * /home/vpsroot/grokflow-staging/deploy/auto_deploy.sh staging >> /home/vpsroot/grokflow-deploy-staging.log 2>&1
```

For each tick:

1. **Lock check** (per-branch). If a previous deploy of the same branch is
   still running, exit.
2. **Fetch origin/&lt;branch&gt;.**
3. **Compare hashes.** If local == remote, exit silently.
4. **Save current commit** to `.last-good-commit` so we can roll back.
5. **Diff to see what changed.** Decide whether to rebuild backend
   (`backend/*` or `docker-compose*.yml` changed) and/or frontend
   (`frontend/*` changed).
6. **Disk safety.** If `/` is ≥ 90% full, run emergency Docker prune.
7. **Hard reset to origin/&lt;branch&gt;.** Untracked files (`.env.*`,
   `browser_profiles/`, `storage/`) are preserved.
8. **Rebuild + restart only what changed.** No full-stack rebuild for
   a frontend-only change.
9. **Run alembic upgrade head** (idempotent).
10. **Health check** against `backend:/health` (up to `HEALTH_TIMEOUT_SEC`,
    default 90 s).
11. **Auto-rollback** to the previous commit if health fails (configurable
    via `ROLLBACK_ON_FAIL=false`).
12. **Post-deploy prune** of cache older than 2h.
13. **Webhook notification** (Discord-compatible) on every transition:
    start / success / fail / rollback. Set `DEPLOY_WEBHOOK_URL` in the
    branch's env file (`.env.prod` / `.env.staging`).
14. **Log everything to `/home/vpsroot/grokflow-deploy[-<branch>].log`.**

## Initial VPS setup (run once)

### Prod

```bash
ssh vpsroot@192.168.1.11
cd /home/vpsroot/grokflow
bash deploy/install_auto_deploy.sh           # defaults to --branch prod
```

### Staging (separate env, same VPS)

```bash
ssh vpsroot@192.168.1.11
sudo mkdir -p /home/vpsroot/grokflow-staging && sudo chown vpsroot: /home/vpsroot/grokflow-staging
cd /home/vpsroot/grokflow-staging

# Pull the installer from any reachable source — easiest is to copy from prod:
cp /home/vpsroot/grokflow/deploy/install_auto_deploy.sh .
bash install_auto_deploy.sh --branch staging

# The installer seeds .env.staging from .env.prod.example. EDIT IT before
# the next cron tick — at minimum change:
#   POSTGRES_PASSWORD       (different from prod)
#   JWT_SECRET              (different from prod)
#   ENCRYPTION_KEY          (different from prod)
#   DOMAIN / API_DOMAIN     (e.g. staging.flowgrok.vpspanel.io.vn)
#   CORS_ORIGINS            (match staging domain)
# And bump the exposed ports in docker-compose.intranet.yml or use a
# compose override to avoid clashing with prod's :5173/:8000.
```

Each install adds its own `auto_deploy.sh <branch>` cron line — prod and
staging coexist without stepping on each other (separate lock files,
separate docker project names).

To disable a branch: `crontab -e` and remove its line.

## CI / GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to `dev` / PR to any branch | Backend pytest + frontend `tsc -b && npm run build` |
| `deploy.yml` | Push to `prod` / `staging`, or `workflow_dispatch` | Audit-only: logs the deploy intent in GitHub Actions and (optionally) pings a public `/health` URL 90 s after push. Does **not** SSH — the VPS cron pulls on its own. |

### Optional GitHub secrets

| Secret | Purpose |
|---|---|
| `HEALTH_URL_PROD` | Public health URL for prod, e.g. `flowgrok.vpspanel.io.vn` (no scheme). |
| `HEALTH_URL_STAGING` | Public health URL for staging. |
| `HEALTH_URL` | Fallback used when the per-branch secret is unset. |

## Commit conventions

Match what's already in the history:

- `feat:` new user-facing feature
- `fix:` bug fix
- `perf:` performance improvement
- `ops:` infra / deploy / Docker / CI changes
- `docs:` docs only
- `refactor:` code-only restructuring

Keep the subject ≤ 70 chars; explain *why* in the body if non-obvious.
End with `Co-Authored-By: ...` for assisted commits.

## Roll back a bad prod deploy

```bash
git checkout prod
git revert <bad-sha>          # safer — preserves history
# or:
git reset --hard <good-sha> && git push --force-with-lease origin prod
# (only do force-reset if no one else has fetched yet)
```

The VPS cron picks the revert/reset up within a minute.

## What the daemon does NOT do

- It will never `git clean -fdx` (so `.env.*`, `storage/`, `browser_profiles/`
  are safe).
- It will never restart the VNC profile container (those persist across
  deploys so you don't lose Grok cookies).
- It will never run two instances of the same branch at once (per-branch lock).

## Auto-rollback

After a deploy the daemon polls `backend:/health` inside the docker network
for up to `HEALTH_TIMEOUT_SEC` seconds (default 90). If the endpoint never
returns `{"status":"ok"}`, the daemon:

1. Reads the saved previous commit from `.last-good-commit`.
2. `git reset --hard <prev>` and rebuilds.
3. Sends a `:leftwards_arrow_with_hook:` webhook on completion.

Disable per-environment by setting `ROLLBACK_ON_FAIL=false` in that
branch's env file (handy when you want a broken commit to stay live on
staging so you can debug it).

## Deploy notifications

The daemon POSTs a Discord-compatible payload (`{"content": "..."}`) on
every transition (started / succeeded / failed / rolled back). To enable,
set in the branch's env file:

```
DEPLOY_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>
```

Discord webhooks work directly; for Slack, use an `incoming-webhook` URL —
the JSON payload is compatible because Slack treats unknown keys as text.
For Telegram or email, point this at a small proxy.
