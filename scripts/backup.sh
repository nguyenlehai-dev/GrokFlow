#!/usr/bin/env bash
# Nightly / hourly backup → restic repo on Google Drive (via rclone).
#
# Captures everything you'd need to bring up the stack on a fresh VPS:
#   - Postgres dump (compressed custom format, --clean --if-exists)
#   - .env.prod                                       (secrets — restic encrypts at rest)
#   - /etc/nginx/grokflow-vhosts/*.conf               (per-tenant nginx configs)
#   - storage_data Docker volume                      (uploaded media)
#   - browser_profiles/                               (encrypted cookies)
#
# Run via cron (hourly recommended; see docs/HIGH-AVAILABILITY.md).
# All credentials live in /home/vpsroot/grokflow/.backup-env (chmod 600).

set -euo pipefail

PROJECT_ROOT="/home/vpsroot/grokflow"
cd "$PROJECT_ROOT"

# shellcheck source=/dev/null
source "$PROJECT_ROOT/.backup-env"

STAGING="$(mktemp -d -t grokflow-backup-XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

# ─── 1. Postgres dump ──────────────────────────────────────────────────────
docker exec grokflow-postgres-1 \
    pg_dump -U grokflow -d grokflow \
    --clean --if-exists --no-owner --format=custom \
    > "$STAGING/grokflow.dump"

# ─── 2. .env.prod (encrypted by restic — safe to back up) ──────────────────
cp .env.prod "$STAGING/env.prod"

# ─── 3. Per-tenant nginx vhost files ───────────────────────────────────────
# Owned by root → use sudo, then chown the tar so restic can read it back.
sudo tar czf "$STAGING/grokflow-vhosts.tgz" -C /etc/nginx/grokflow-vhosts .
sudo chown "$(id -u):$(id -g)" "$STAGING/grokflow-vhosts.tgz"

# ─── 4. storage_data volume (uploaded media) ───────────────────────────────
# The volume's mount point is owned by docker user; sudo to read.
STORAGE_MOUNT="$(docker volume inspect grokflow_storage_data --format '{{.Mountpoint}}')"
sudo tar czf "$STAGING/storage_data.tgz" -C "$STORAGE_MOUNT" .
sudo chown "$(id -u):$(id -g)" "$STAGING/storage_data.tgz"

# ─── 5. Push to restic ─────────────────────────────────────────────────────
# Two snapshots per run: small (tagged 'state') for fast restores of just
# the DB+config, big (tagged 'profiles') for the slow browser_profiles dir.
# Restic dedupes between snapshots so re-uploads of unchanged profiles
# cost ~nothing.
restic backup \
    --tag state \
    --host grokflow \
    "$STAGING"

restic backup \
    --tag profiles \
    --host grokflow \
    "$PROJECT_ROOT/browser_profiles"

# ─── 6. Retention — generous since the user has 5TB on Drive ──────────────
# Roughly: every-hour for 2 days, every-day for 30, every-week for 12,
# every-month for 24, every-year forever. Adjust if storage grows tight.
restic forget --prune \
    --keep-hourly 48 \
    --keep-daily 30 \
    --keep-weekly 12 \
    --keep-monthly 24 \
    --keep-yearly 5

# ─── 7. Sanity: print the new snapshot id ──────────────────────────────────
echo "OK $(date -Iseconds) — latest snapshots:"
restic snapshots --latest 2 --compact
