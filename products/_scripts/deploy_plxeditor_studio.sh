#!/usr/bin/env bash
# One-shot deploy for plxeditor-studio on dev VPS.
set -e
cd /home/vpsroot/plxeditor-studio-standalone

cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
PUBLIC_DOMAIN=192.168.1.11
PUBLIC_API_URL=http://192.168.1.11:48000
POSTGRES_USER=plxeditor_sa
POSTGRES_DB=plxeditor_sa
GUNICORN_WORKERS=2
BACKEND_HOST_PORT=48000
FRONTEND_HOST_PORT=45173
EOF
chmod 600 .env

echo "=== build + up ==="
docker compose up -d --build 2>&1 | tail -10
sleep 25

echo "=== alembic upgrade ==="
docker compose run --rm --entrypoint "" backend alembic upgrade head 2>&1 | tail -5

echo "=== restart backend ==="
docker compose restart backend
sleep 10

echo "=== compose ps ==="
docker compose ps --format "table {{.Service}}\t{{.Status}}"

echo "=== /health ==="
curl -fsS http://localhost:48000/health || echo "BE down"
echo ""
echo "=== FE ==="
curl -fsS http://localhost:45173/ -o /dev/null -w "FE %{http_code}\n"
