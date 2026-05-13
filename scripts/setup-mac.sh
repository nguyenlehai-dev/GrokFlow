#!/usr/bin/env bash
# One-shot bootstrap for a fresh Mac M1 → ready to restore + run GrokFlow.
#
# Run AFTER:
#   - Docker Desktop installed (with Memory ≥ 5GB in Settings → Resources)
#   - You're in the cloned `grokflow/` repo directory
#   - You have RESTIC_PASSWORD + the Drive folder ID in hand
#
# This script:
#   1. Verifies prerequisites (Docker, brew, git, python)
#   2. Installs missing CLI tools via brew (rclone, restic, cloudflared)
#   3. Prompts for secrets and writes .backup-env + helps you OAuth rclone
#   4. Brings up postgres + redis
#   5. Restores from latest Drive snapshot
#   6. Brings up the rest of the stack
#
# Idempotent — safe to re-run if a step fails.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# --- 1. Sanity ---
[[ "$(uname -s)" == "Darwin" ]] || fail "Run this on macOS only"
[[ -f docker-compose.intranet.yml ]] || fail "Run from the grokflow/ repo root"

command -v docker >/dev/null || fail "Install Docker Desktop first: https://www.docker.com/products/docker-desktop"
docker info >/dev/null 2>&1 || fail "Docker Desktop is installed but not running. Start it from Applications."

ok "macOS + Docker Desktop OK"

# --- 2. brew tools ---
if ! command -v brew >/dev/null; then
  warn "Homebrew not found — installing"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

for tool in rclone restic cloudflared; do
  if ! command -v "$tool" >/dev/null; then
    echo "installing $tool..."
    brew install "$tool"
  fi
done
ok "brew tools (rclone restic cloudflared) installed"

# --- 3. rclone OAuth ---
if [[ ! -f ~/.config/rclone/rclone.conf ]] || ! grep -q '^\[gdrive\]' ~/.config/rclone/rclone.conf 2>/dev/null; then
  warn "rclone not configured for Google Drive — two-step OAuth:"
  echo
  echo "  Step A (separate terminal): run 'rclone authorize drive'"
  echo "     A browser will open. Sign in to the Google account that owns"
  echo "     the backup folder. Copy the entire token JSON it prints."
  echo
  echo "  Step B (back here): paste the token below"
  echo
  read -rp "Press ENTER once you have the token..."
  echo "Paste the token JSON (single line ending in '}'), then ENTER:"
  read -r RCLONE_TOKEN
  read -rp "Enter your Drive folder ID (e.g. 1Ypxf2J6g4gDix2Igo2iapqY_wcqfJbkK): " DRIVE_FOLDER
  mkdir -p ~/.config/rclone
  cat > ~/.config/rclone/rclone.conf <<EOF
[gdrive]
type = drive
scope = drive
token = $RCLONE_TOKEN
root_folder_id = $DRIVE_FOLDER
EOF
  chmod 600 ~/.config/rclone/rclone.conf
fi
rclone lsd gdrive: >/dev/null || fail "rclone can't read Drive — check token / folder ID"
ok "rclone → Google Drive working"

# --- 4. .backup-env ---
if [[ ! -f .backup-env ]]; then
  read -rsp "Enter RESTIC_PASSWORD (from password manager): " RP; echo
  cat > .backup-env <<EOF
export RESTIC_REPOSITORY="rclone:gdrive:grokflow-restic"
export RESTIC_PASSWORD="$RP"
export RCLONE_CONFIG="\$HOME/.config/rclone/rclone.conf"
EOF
  chmod 600 .backup-env
fi
ok ".backup-env written"

# --- 5. .env.prod sanity ---
if [[ ! -f .env.prod ]]; then
  warn ".env.prod not found — copying from example. YOU MUST EDIT IT NOW."
  cp .env.prod.example .env.prod
  echo
  echo "Open .env.prod and fill in (at minimum):"
  echo "  POSTGRES_PASSWORD   (must match the VPS — otherwise restore fails)"
  echo "  JWT_SECRET"
  echo "  ENCRYPTION_KEY"
  echo "  CLOUDFLARE_TUNNEL_TOKEN"
  echo
  echo "Then re-run this script."
  exit 0
fi
ok ".env.prod present"

# --- 6. Postgres + Redis up (needed before restore) ---
docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  up -d postgres redis

echo "waiting for postgres healthy..."
for _ in $(seq 1 30); do
  if docker exec grokflow-postgres-1 pg_isready -U "${POSTGRES_USER:-grokflow}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
ok "postgres + redis up"

# --- 7. Restore ---
if [[ -x scripts/restore.sh ]]; then
  echo "restoring from Drive (latest snapshot, including profiles)..."
  ./scripts/restore.sh latest --profiles
else
  warn "scripts/restore.sh not executable — running with bash"
  bash scripts/restore.sh latest --profiles
fi
ok "data restored"

# --- 8. Build + bring up the rest ---
docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  build backend frontend
docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  up -d

sleep 20
docker exec grokflow-backend-1 alembic upgrade head

# --- 9. Smoke test ---
echo
ok "Bring-up complete. Smoke tests:"
echo
docker ps --filter name=grokflow --format '  {{.Names}}\t{{.Status}}'
echo
curl -fsS http://localhost:8000/health && echo
echo
ok "If health is ok, Cloudflare tunnel container should already be connected."
echo "  Check dash.cloudflare.com → Zero Trust → Tunnels — your tunnel should show"
echo "  TWO connectors (VPS + Mac) until you stop VPS."
echo
echo "Next step: stop VPS containers when you're confident Mac is serving:"
echo "  ssh vpsroot@<VPS_IP> 'cd grokflow && sudo docker compose down'"
