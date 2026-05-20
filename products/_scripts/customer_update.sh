#!/usr/bin/env bash
# customer_update.sh — pull latest from the product git repo, rebuild,
# migrate, restart. Safe to run repeatedly — git pull is idempotent.
#
# Usage:
#   cd <product> && bash _scripts/customer_update.sh
#
# To schedule nightly auto-update, add to root's crontab:
#   0 3 * * * cd /opt/<product> && bash _scripts/customer_update.sh \
#             >> /var/log/<product>-update.log 2>&1

set -euo pipefail

red()    { printf '\033[1;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
cyan()   { printf '\033[1;36m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

[[ -f .env ]] || { red ".env missing — run customer_setup.sh first"; exit 1; }

cyan "==> Current commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
cyan "==> Pulling latest..."

# Stash any local edits (customer should not edit code, but be safe)
if ! git diff --quiet || ! git diff --cached --quiet; then
    yellow "Local changes detected — stashing"
    git stash push -m "customer_update.sh autostash $(date +%s)" || true
fi

git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "$LOCAL")

if [[ "$LOCAL" == "$REMOTE" ]]; then
    green "Already up to date — nothing to do."
    exit 0
fi

git reset --hard "@{u}"
cyan "==> New commit: $(git rev-parse --short HEAD)"

cyan "==> docker compose up -d --build (may take a few min if image changes)"
docker compose up -d --build

cyan "==> Wait for postgres healthy"
sleep 10

cyan "==> Alembic upgrade head"
docker compose run --rm --entrypoint "" backend alembic upgrade head

cyan "==> Restart backend + worker so they reload code"
docker compose restart backend worker idle-cleanup 2>/dev/null || \
    docker compose restart backend

sleep 8

BE_PORT=$(grep '^BACKEND_HOST_PORT=' .env | cut -d= -f2)
if curl -fsS "http://localhost:${BE_PORT}/health" >/dev/null; then
    green "Update complete — backend healthy on :${BE_PORT}"
else
    red "Backend not healthy after update — check: docker compose logs backend --tail=80"
    exit 1
fi
