#!/usr/bin/env bash
# First-time setup on a fresh Ubuntu/Debian VPS. Run as a sudoer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<your-repo>/main/deploy/bootstrap.sh | bash
# or copy this file over and: bash bootstrap.sh

set -euo pipefail

echo "==> Updating apt"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg ufw

echo "==> Installing Docker (official script)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "   (you must log out and log back in for the docker group to take effect)"
fi

echo "==> Configuring UFW firewall"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "==> Creating /opt/grokflow"
sudo mkdir -p /opt/grokflow
sudo chown "$USER":"$USER" /opt/grokflow

echo
echo "Done. Next steps:"
echo "  1. cd /opt/grokflow"
echo "  2. git clone <repo> ."
echo "  3. cp .env.prod.example .env.prod && edit secrets"
echo "  4. docker compose -f docker-compose.prod.yml up -d --build"
echo "  5. docker compose -f docker-compose.prod.yml exec backend \\"
echo "       python -m app.scripts.create_admin --email admin@yours --password 'change_me'"
