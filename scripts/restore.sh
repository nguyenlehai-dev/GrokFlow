#!/usr/bin/env bash
# Restore the GrokFlow state from a restic snapshot back into a running stack.
#
# Usage:
#   ./scripts/restore.sh                 → restore the latest 'state' snapshot
#   ./scripts/restore.sh <snapshot-id>   → restore a specific snapshot
#   ./scripts/restore.sh --list          → just list available snapshots
#   ./scripts/restore.sh --profiles      → also restore browser_profiles (slow)
#
# What this DOES:
#   - psql-restore the Postgres dump from the snapshot
#   - extract the storage_data Docker volume (uploaded media)
#   - copy back .env.prod + nginx vhosts
#   - optionally restore browser_profiles (encrypted cookies)
#
# What it DOES NOT touch:
#   - your code (git checkout that yourself)
#   - the Docker images (docker compose build separately)
#   - rclone.conf / .backup-env (you already have these or you can't read
#     the restic repo to call this script)
#
# Safe to run on a half-installed VPS as long as Postgres + restic are up.

set -euo pipefail

PROJECT_ROOT="/home/vpsroot/grokflow"
cd "$PROJECT_ROOT"
# shellcheck source=/dev/null
source "$PROJECT_ROOT/.backup-env"

SNAPSHOT="latest"
RESTORE_PROFILES=false
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --list)     LIST_ONLY=true ;;
        --profiles) RESTORE_PROFILES=true ;;
        --help|-h)
            sed -n '2,/^set/p' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *)          SNAPSHOT="$1" ;;
    esac
    shift
done

if $LIST_ONLY; then
    echo "=== state snapshots (Postgres + config + storage volume) ==="
    restic snapshots --tag state --compact
    echo
    echo "=== profiles snapshots (browser_profiles dir) ==="
    restic snapshots --tag profiles --compact
    exit 0
fi

# ─── Confirm destructive op ────────────────────────────────────────────────
echo "About to restore snapshot: $SNAPSHOT"
echo "Postgres database 'grokflow' will be CLEANED + reloaded."
echo "Storage volume + .env.prod + nginx vhosts will be OVERWRITTEN."
$RESTORE_PROFILES && echo "browser_profiles will be OVERWRITTEN."
read -rp "Continue? (yes/N) " ans
[[ "$ans" == "yes" ]] || { echo "aborted"; exit 1; }

STAGING="$(mktemp -d -t grokflow-restore-XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

# ─── 1. Restic restore of the 'state' bundle ───────────────────────────────
echo "→ Pulling snapshot $SNAPSHOT (state) from Drive…"
restic restore "$SNAPSHOT" --tag state --target "$STAGING"

# The state bundle lands inside $STAGING/<tmpdir from backup time>/. Find it.
STATE_DIR="$(find "$STAGING" -name grokflow.dump -printf '%h\n' | head -1)"
[[ -n "$STATE_DIR" ]] || { echo "could not find restored state dir"; exit 1; }

# ─── 2. Postgres restore ───────────────────────────────────────────────────
echo "→ Restoring Postgres…"
docker exec -i grokflow-postgres-1 \
    pg_restore -U grokflow -d grokflow --clean --if-exists --no-owner \
    < "$STATE_DIR/grokflow.dump"

# ─── 3. storage_data volume ────────────────────────────────────────────────
echo "→ Restoring uploaded media volume…"
STORAGE_MOUNT="$(docker volume inspect grokflow_storage_data --format '{{.Mountpoint}}')"
sudo rm -rf "$STORAGE_MOUNT"/*
sudo tar xzf "$STATE_DIR/storage_data.tgz" -C "$STORAGE_MOUNT"

# ─── 4. .env.prod + nginx vhosts ──────────────────────────────────────────
echo "→ Restoring .env.prod + nginx vhosts…"
cp "$STATE_DIR/env.prod" "$PROJECT_ROOT/.env.prod"
chmod 600 "$PROJECT_ROOT/.env.prod"
sudo tar xzf "$STATE_DIR/grokflow-vhosts.tgz" -C /etc/nginx/grokflow-vhosts/
sudo nginx -t && sudo nginx -s reload

# ─── 5. Profiles (optional, slow) ─────────────────────────────────────────
if $RESTORE_PROFILES; then
    echo "→ Pulling profiles snapshot from Drive (slow)…"
    restic restore "$SNAPSHOT" --tag profiles --target "$STAGING/profiles"
    rsync -a --delete \
        "$STAGING/profiles/home/vpsroot/grokflow/browser_profiles/" \
        "$PROJECT_ROOT/browser_profiles/"
    sudo chown -R 10001:10001 "$PROJECT_ROOT/browser_profiles"
fi

# ─── 6. Restart so backend re-reads .env + flushes caches ─────────────────
echo "→ Restarting backend…"
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
    restart backend worker

echo
echo "✓ Restore done. Smoke-check:"
docker exec grokflow-postgres-1 psql -U grokflow -d grokflow -c \
    "SELECT (SELECT COUNT(*) FROM users) AS users, \
            (SELECT COUNT(*) FROM gw_requests) AS requests;"
