# Branching & Deploy Workflow

GrokFlow uses **3 branches** mapped to **3 environments**, plus an
auto-deploy daemon on the VPS that polls `prod` and ships changes
within ~1 minute of a push.

## Branches

| Branch | Purpose | Auto-deploy? | Stability |
|---|---|---|---|
| `dev` | Daily development. Push frequently. | No | Unstable, may break |
| `staging` | Optional pre-prod gate (manual). | Manual via GitHub Actions `workflow_dispatch` | Should be working |
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

The daemon is a single bash script run by `cron` every minute:
[`deploy/auto_deploy.sh`](../deploy/auto_deploy.sh)

For each tick:

1. **Lock check.** If a previous deploy is still running, exit.
2. **Fetch origin/prod.**
3. **Compare hashes.** If `git rev-parse prod == origin/prod`, exit silently.
4. **Diff to see what changed.** Decide whether to rebuild backend
   (`backend/*` or `docker-compose*.yml` changed) and/or frontend
   (`frontend/*` changed).
5. **Disk safety.** If `/` is ≥ 90% full, run emergency Docker prune.
6. **Hard reset to origin/prod.** Untracked files (`.env.prod`,
   `browser_profiles/`, `storage/`) are preserved by `git reset --hard`
   because they're in `.gitignore`.
7. **Rebuild + restart only what changed.** No full-stack rebuild for
   a frontend-only change.
8. **Run alembic upgrade head** (idempotent).
9. **Post-deploy prune** of cache older than 2h.
10. **Log everything to `/var/log/grokflow-deploy.log`.**

## Initial VPS setup (run once)

```bash
ssh vpsroot@192.168.1.15
cd /home/vpsroot/grokflow
bash deploy/install_auto_deploy.sh
```

This:
- Initializes a git repo in the existing dir (preserves `.env.prod`)
- Sets origin to the public GitHub repo
- Checks out `prod` branch
- Installs a cron entry that runs every minute

After that, you can disable it via `crontab -e` and remove the
`auto_deploy.sh` line.

## CI / GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to `dev` / PR to any branch | Backend pytest + frontend `tsc -b && npm run build` |
| `deploy.yml` | Push to `prod` / `staging`, or `workflow_dispatch` | Optional SSH-based deploy. Currently **disabled** in favor of the VPS-side cron daemon (more reliable when GitHub runners can't reach the LAN VPS). |

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

- It will never `git clean -fdx` (so `.env.prod`, `storage/`, `browser_profiles/`
  are safe).
- It will never restart the VNC profile container (those persist across
  deploys so you don't lose Grok cookies).
- It will never run with two instances at once (lock file).
- It will never deploy from a non-prod branch unless you manually call
  `bash deploy/auto_deploy.sh staging`.
