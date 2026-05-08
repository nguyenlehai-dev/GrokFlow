#!/usr/bin/env bash
# Pull latest code, rebuild, run migrations, restart.
# Run from /opt/grokflow on the server.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git fetch --all --prune
git checkout "${BRANCH:-main}"
git pull --ff-only

echo "==> Rebuilding images"
docker compose -f docker-compose.prod.yml build

echo "==> Running migrations"
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

echo "==> Recreating services"
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Pruning old images"
docker image prune -f

echo
echo "Deploy complete. Status:"
docker compose -f docker-compose.prod.yml ps
