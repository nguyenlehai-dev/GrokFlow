# VPS folder layout (canonical)

Where every file the production stack touches lives, after the May 2026
cleanup. Treat this as the source of truth — if a new file shows up
somewhere not in this doc, it's cruft and should be moved or deleted.

## /home/vpsroot/grokflow/ — the code repo

```
/home/vpsroot/grokflow/
├─ .git/                      git working tree
├─ .gitignore .env.example .env.prod.example   committed
├─ .env.prod                  ← LIVE secrets (chmod 600, NEVER commit)
├─ .backup-env                ← restic creds (chmod 600, NEVER commit)
├─ backend/                   FastAPI source
├─ frontend/                  Vite + React source
├─ docs/                      this folder
├─ scripts/                   backup.sh, restore.sh, backup-health.sh
├─ docker-compose.intranet.yml   the compose file in active use
├─ deploy/                    one-off setup scripts (host nginx, etc)
├─ helper/                    static assets served at /static/
├─ vnc/                       VNC Docker image source
├─ browser_profiles/          bind mount → backend container's /app/browser_profiles
│
├─ logs            -> /var/log/grokflow           ← convenience symlinks
├─ nginx-vhosts    -> /etc/nginx/grokflow-vhosts     (.gitignored, VPS-only)
└─ docker-volumes  -> /var/lib/docker/volumes
```

The three trailing entries are absolute symlinks created by the
"single-tree" setup — they expose every operational path under the
project root so you can `cd ~/grokflow && ls logs/` instead of
hunting through `/var/log/`. They're `.gitignore`'d (broken symlinks
on any dev machine).

To recreate them on a fresh VPS:

```bash
cd /home/vpsroot/grokflow
ln -sfn /var/log/grokflow         logs
ln -sfn /etc/nginx/grokflow-vhosts nginx-vhosts
ln -sfn /var/lib/docker/volumes   docker-volumes
```

**Rules**:
- Code goes in `backend/` or `frontend/`. Nothing at the root of the
  repo except top-level config files.
- Secrets (`.env.prod`, `.backup-env`) stay outside git via `.gitignore`.
- Anything in `/tmp/grokflow-*` is staging — must be cleaned by the
  script that created it (backup.sh's `trap rm -rf "$STAGING"` line).

## /var/log/grokflow/ — centralised logs

```
/var/log/grokflow/
├─ backup.log           cron output from scripts/backup.sh
├─ backup-health.log    cron output from scripts/backup-health.sh
└─ nginx-reloader.log   (when systemd path unit fires)
```

Rotated weekly via `/etc/logrotate.d/grokflow`:
```
weekly, rotate 8, compress, delaycompress, copytruncate
```

That keeps 8 weeks of history while never letting any one file grow
past ~10 MB.

## /etc/nginx/ — host nginx config

```
/etc/nginx/
├─ sites-available/grokflow    main host vhost (port 80 → frontend + /api/ → backend)
├─ sites-enabled/grokflow     -> symlink to sites-available
├─ conf.d/grokflow-vhosts.conf   one-liner: include /etc/nginx/grokflow-vhosts/*.conf
└─ grokflow-vhosts/             per-tenant vhosts, AUTO-GENERATED
   ├─ grokflow-flow_vpspanel_io_vn.conf
   └─ grokflow-gateways_plxeditor_com.conf
```

Per-tenant vhosts are written by the backend (see
`backend/app/services/nginx_sync.py`) when an admin creates/updates a
Domain row. A systemd path unit watches the dir and reloads nginx.

**Never hand-edit files in `grokflow-vhosts/`** — they're regenerated.
Edit the template in `nginx_sync.py` if you need to change the proxy
config.

## /etc/systemd/system/ — service watchers

```
/etc/systemd/system/
├─ grokflow-nginx-reloader.service   reload nginx on grokflow-vhosts/ change
└─ grokflow-nginx-reloader.path       (the watcher)
```

Both come from `deploy/setup-host-nginx.sh`. Enable with
`systemctl enable --now grokflow-nginx-reloader.path`.

## /etc/logrotate.d/grokflow

```
/var/log/grokflow/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

Runs nightly via systemd-timers. Files older than 8 weeks → deleted.

## /var/lib/docker/volumes/ — Docker-managed (don't touch directly)

Docker controls these. Backup pipeline reads them via
`docker volume inspect`, NEVER edit raw:

```
/var/lib/docker/volumes/
├─ grokflow_postgres_data/_data/    Postgres data dir
├─ grokflow_storage_data/_data/     User uploads
├─ grokflow_redis_data/_data/       Redis dump.rdb (cache, not critical)
└─ grokflow_profile_data/_data/     legacy profile volume (unused since bind mount)
```

If you need to inspect:
```bash
docker volume inspect grokflow_storage_data
sudo ls "$(docker volume inspect grokflow_storage_data --format '{{.Mountpoint}}')"
```

## Cron — backup automation

```bash
sudo crontab -l | grep grokflow
```

Should show exactly two lines:

```cron
*/15 * * * * /home/vpsroot/grokflow/scripts/backup.sh >> /var/log/grokflow/backup.log 2>&1
5,20,35,50 * * * * /home/vpsroot/grokflow/scripts/backup-health.sh >> /var/log/grokflow/backup-health.log 2>&1
```

Anything else under `grep grokflow` is leftover from earlier setups —
remove it.

## What NOT to put on the server

If you find any of these, they're cruft:

- `*.tsx` / `*.py` / `*.md` at the repo root (only allowed: README, .env*,
  docker-compose.*, .git*)
- Files inside `/tmp/grokflow-*` older than 30 minutes (backup staging
  should self-clean via the `trap` in backup.sh)
- `*.bak.*` files anywhere (use restic for history)
- Old OAuth logs containing token JSON (`/tmp/rclone-oauth.log`)
- `.env.prod.bak.*` (same — restic backup keeps history)
- Test vhosts in `/etc/nginx/grokflow-vhosts/` for domains that no
  longer have a row in the `domains` table

## Periodic cleanup checklist

Once a month:

```bash
# Stale /tmp staging from cancelled backups
sudo find /tmp -maxdepth 1 -name 'grokflow-backup-*' -mmin +60 -exec rm -rf {} \;

# Old Docker images not in use
sudo docker image prune -a -f

# Logs already rotated past 8 weeks (logrotate should handle but sanity check)
sudo find /var/log/grokflow -name '*.gz' -mtime +60 -delete

# Vhosts for deleted domains
sudo docker exec grokflow-postgres-1 psql -U grokflow -d grokflow -tA \
  -c "SELECT hostname FROM domains WHERE hostname != '*'" \
  | sort > /tmp/live-domains.txt
ls /etc/nginx/grokflow-vhosts/ | sed 's/^grokflow-//;s/.conf$//;s/_/./g' \
  | sort > /tmp/vhost-files.txt
diff /tmp/live-domains.txt /tmp/vhost-files.txt
# Anything in vhost-files but not live-domains is a stale vhost — delete it.
```

Or just let the next admin domain create/update fix things — the
backend rewrites whatever it owns.
