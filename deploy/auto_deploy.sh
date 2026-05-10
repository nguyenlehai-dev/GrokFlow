#!/usr/bin/env bash
# auto_deploy.sh — runs on the VPS, pulls origin/<branch> and redeploys
# whenever a new commit lands. Designed to be called by cron every minute.
#
# Tracking the prod branch with a watcher means the user can `git push
# origin prod` from any machine and within ~1 minute the live site
# reflects the change. No SSH keys / runners needed — VPS just polls.
#
# Usage (one-off):
#   bash deploy/auto_deploy.sh prod
#
# Usage (cron — install via deploy/install_auto_deploy.sh):
#   * * * * * /home/vpsroot/grokflow/deploy/auto_deploy.sh prod >> /var/log/grokflow-deploy.log 2>&1

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/vpsroot/grokflow}"
BRANCH="${1:-prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.intranet.yml}"
LOCK_FILE="/tmp/grokflow-auto-deploy.lock"

# Single-instance: skip if a previous deploy is still running.
if [[ -f "$LOCK_FILE" ]]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "[$(date -Iseconds)] another deploy ($pid) is running, skipping"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

cd "$REPO_DIR"

# Fetch latest commits without merging
git fetch --quiet origin "$BRANCH"

LOCAL=$(git rev-parse "$BRANCH" 2>/dev/null || echo "missing")
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
    # Already up-to-date — exit silently to keep cron logs clean.
    exit 0
fi

echo "[$(date -Iseconds)] new commit on $BRANCH: $LOCAL → $REMOTE"

# Detect what changed so we know whether to rebuild.
CHANGED_FILES=$(git diff --name-only "$LOCAL..$REMOTE" 2>/dev/null || git ls-files)
backend_changed=false
frontend_changed=false
compose_changed=false
echo "$CHANGED_FILES" | while read -r f; do
    case "$f" in
        backend/*) backend_changed=true ;;
        frontend/*) frontend_changed=true ;;
        docker-compose*.yml) compose_changed=true ;;
    esac
done
backend_changed=$(echo "$CHANGED_FILES" | grep -q "^backend/" && echo true || echo false)
frontend_changed=$(echo "$CHANGED_FILES" | grep -q "^frontend/" && echo true || echo false)
compose_changed=$(echo "$CHANGED_FILES" | grep -q "^docker-compose" && echo true || echo false)

# Hard-reset working tree to remote — never preserve local edits in production.
# Files not tracked by git (.env.prod, browser_profiles/, storage/) are kept
# because they're in .gitignore.
git reset --hard "origin/$BRANCH"

# Pre-deploy disk safety
PCT=$(df --output=pcent / | tail -1 | tr -dc 0-9)
if [[ "$PCT" -ge 90 ]]; then
    echo "[$(date -Iseconds)] disk at ${PCT}% — emergency prune"
    docker builder prune -af 2>&1 | tail -3
    docker image prune -af 2>&1 | tail -3
fi

DC="docker compose --env-file .env.prod -f $COMPOSE_FILE"

if [[ "$backend_changed" == "true" || "$compose_changed" == "true" ]]; then
    echo "[$(date -Iseconds)] rebuilding backend/worker/idle-cleanup"
    $DC up -d --build backend worker idle-cleanup
else
    echo "[$(date -Iseconds)] backend unchanged, skipping rebuild"
    $DC up -d backend worker idle-cleanup
fi

# Wait for backend, then run migrations (always — alembic is idempotent if
# already at head).
for _ in $(seq 1 30); do
    if $DC ps --status running --services 2>/dev/null | grep -q backend; then
        break
    fi
    sleep 1
done
echo "[$(date -Iseconds)] alembic upgrade head"
$DC exec -T backend alembic upgrade head || echo "alembic returned non-zero (may already be at head)"
$DC restart worker idle-cleanup

if [[ "$frontend_changed" == "true" ]]; then
    echo "[$(date -Iseconds)] rebuilding frontend"
    $DC up -d --build frontend
fi

echo "[$(date -Iseconds)] post-deploy prune"
docker builder prune -f --filter 'until=2h' 2>&1 | tail -2 || true
docker image prune -f 2>&1 | tail -2 || true

PCT_AFTER=$(df --output=pcent / | tail -1 | tr -dc 0-9)
echo "[$(date -Iseconds)] deploy done. disk: ${PCT_AFTER}%. live commit: $REMOTE"
