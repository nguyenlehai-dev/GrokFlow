#!/usr/bin/env bash
# Self-contained server setup. Chạy trên VPS sau khi đã extract code.
#
# Usage:
#   bash deploy/server-setup.sh intranet
#   bash deploy/server-setup.sh cloudflare <DOMAIN> <API_DOMAIN> <TUNNEL_TOKEN>
#
# Idempotent: chạy lại an toàn — sẽ giữ .env.prod cũ, chỉ rebuild + restart.

set -euo pipefail

MODE="${1:-intranet}"

if [[ "$MODE" == "cloudflare" ]]; then
    DOMAIN="${2:-}"
    TUNNEL_TOKEN="${3:-}"
    if [[ -z "$DOMAIN" || -z "$TUNNEL_TOKEN" ]]; then
        echo "Usage: bash deploy/server-setup.sh cloudflare <DOMAIN> <TUNNEL_TOKEN>"
        echo "Example: bash deploy/server-setup.sh cloudflare flowgrok.vpspanel.io.vn 'eyJh...'"
        exit 1
    fi
    COMPOSE_FILE="docker-compose.cloudflare.yml"
    API_DOMAIN="$DOMAIN"
    PUBLIC_API_URL=""           # same-origin → frontend nginx proxy
    CORS_ORIGINS="https://$DOMAIN"
elif [[ "$MODE" == "intranet" ]]; then
    COMPOSE_FILE="docker-compose.intranet.yml"
    SERVER_IP=$(hostname -I | awk '{print $1}')
    PUBLIC_API_URL="http://${SERVER_IP}:8000"
    CORS_ORIGINS="http://${SERVER_IP}:5173,http://localhost:5173"
    DOMAIN=""
    API_DOMAIN=""
    TUNNEL_TOKEN=""
else
    echo "Unknown mode: $MODE (use 'intranet' or 'cloudflare')"
    exit 1
fi

cd "$(dirname "$0")/.."

echo "==> Mode: $MODE"
echo "==> Compose: $COMPOSE_FILE"
echo "==> Public API URL: $PUBLIC_API_URL"

if [[ ! -f .env.prod ]]; then
    echo "==> Generating .env.prod (first time)"
    PG_PASSWORD=$(openssl rand -hex 24)
    JWT_SECRET=$(openssl rand -hex 32)

    # Sinh Fernet key — dùng python3 nếu có, nếu không thì docker
    if command -v python3 >/dev/null && python3 -c "from cryptography.fernet import Fernet" 2>/dev/null; then
        ENC_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    else
        ENC_KEY=$(docker run --rm python:3.11-slim sh -c "pip install --quiet cryptography && python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'")
    fi

    cat > .env.prod <<ENVEOF
APP_NAME=GrokFlow
APP_ENV=production
APP_DEBUG=false

POSTGRES_USER=grokflow
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=grokflow

JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=1440

API_KEY_PREFIX=uxpm_live
ENCRYPTION_KEY=$ENC_KEY

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/storage
PROFILE_BASE_PATH=/app/browser_profiles

MAX_CONCURRENT_JOBS_PER_USER=2
MAX_CONCURRENT_JOBS_PER_PROFILE=1
DEFAULT_DAILY_LIMIT=1000
JOB_TIMEOUT_SECONDS=600

CORS_ORIGINS=$CORS_ORIGINS
PUBLIC_API_URL=$PUBLIC_API_URL

DOMAIN=$DOMAIN
API_DOMAIN=$API_DOMAIN
CLOUDFLARE_TUNNEL_TOKEN=$TUNNEL_TOKEN

TAG=latest
ENVEOF

    chmod 600 .env.prod
    echo "==> .env.prod created. Backup file này — chứa secrets không thể tái tạo!"
else
    echo "==> .env.prod tồn tại, dùng lại. Cập nhật DOMAIN/TUNNEL_TOKEN nếu cần."
    if [[ "$MODE" == "cloudflare" ]]; then
        sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env.prod
        sed -i "s|^API_DOMAIN=.*|API_DOMAIN=$API_DOMAIN|" .env.prod
        # Escape token (chứa dot, slash) cho sed
        ESC_TOKEN=$(printf '%s\n' "$TUNNEL_TOKEN" | sed 's/[\/&|]/\\&/g')
        sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$ESC_TOKEN|" .env.prod
        sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=$PUBLIC_API_URL|" .env.prod
        sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$CORS_ORIGINS|" .env.prod
    fi
fi

echo "==> docker compose build + up"
docker compose --env-file .env.prod -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for backend health (up to 90s)"
for i in $(seq 1 45); do
    if docker compose --env-file .env.prod -f "$COMPOSE_FILE" exec -T backend curl -fsS http://localhost:8000/health 2>/dev/null | grep -q '"status":"ok"'; then
        echo "    Backend healthy"
        break
    fi
    sleep 2
done

echo "==> Seeding admin user (skip if exists)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 12)}"
docker compose --env-file .env.prod -f "$COMPOSE_FILE" exec -T backend \
    python -m app.scripts.create_admin --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"

echo
echo "============================================================"
echo "Deploy complete!"
echo "============================================================"
if [[ "$MODE" == "cloudflare" ]]; then
    echo "Frontend: https://$DOMAIN"
    echo "API:      https://$DOMAIN/docs"
    echo
    echo "TIẾP THEO: trong Cloudflare Zero Trust → Tunnels → <tunnel> → Public Hostname:"
    echo "    $DOMAIN  →  service: HTTP  url: frontend:80"
else
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo "Frontend: http://${SERVER_IP}:5173"
    echo "API:      http://${SERVER_IP}:8000/docs"
fi
echo
echo "Admin login:"
echo "    Email:    $ADMIN_EMAIL"
echo "    Password: $ADMIN_PASSWORD"
echo
echo "Status:"
docker compose --env-file .env.prod -f "$COMPOSE_FILE" ps
