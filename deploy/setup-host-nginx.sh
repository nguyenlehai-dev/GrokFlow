#!/usr/bin/env bash
# setup-host-nginx.sh — one-shot host configuration for auto-managed domains.
#
# What it does:
#   1. Creates /etc/nginx/grokflow-vhosts/ — backend writes vhost .conf files here.
#   2. Adds an include directive in /etc/nginx/conf.d/grokflow-vhosts.conf so
#      those files are picked up.
#   3. Installs an inotify-based reloader as a systemd service that watches
#      the dir and runs `nginx -s reload` whenever a .conf is added/removed/modified.
#   4. Validates + reloads nginx once at the end.
#
# Idempotent: re-running just re-asserts the desired state.
#
# Usage:  sudo bash deploy/setup-host-nginx.sh

set -euo pipefail

VHOST_DIR="/etc/nginx/grokflow-vhosts"
INCLUDE_FILE="/etc/nginx/conf.d/grokflow-vhosts.conf"
RELOAD_SVC="/etc/systemd/system/grokflow-nginx-reloader.service"

if [[ $EUID -ne 0 ]]; then
    echo "Must run as root (use sudo)." >&2
    exit 1
fi

echo "==> [1/4] Creating vhost directory: $VHOST_DIR"
mkdir -p "$VHOST_DIR"
# Backend container writes here. UID 1000 = appuser inside container.
# Use group-write + setgid so files inherit group ownership.
chown root:1000 "$VHOST_DIR"
chmod 2775 "$VHOST_DIR"

echo "==> [2/4] Installing include directive: $INCLUDE_FILE"
cat > "$INCLUDE_FILE" <<EOF
# Pulled in by nginx.conf via the default include /etc/nginx/conf.d/*.conf.
# Auto-generated per-domain vhost files live in $VHOST_DIR.
include $VHOST_DIR/*.conf;
EOF

echo "==> [3/4] Installing inotify reloader (apt install inotify-tools if needed)"
if ! command -v inotifywait >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq inotify-tools
fi

cat > "$RELOAD_SVC" <<EOF
[Unit]
Description=GrokFlow nginx vhost reloader (inotify on $VHOST_DIR)
After=nginx.service
Wants=nginx.service

[Service]
Type=simple
ExecStart=/bin/bash -c '\
    while inotifywait -qq -e create,delete,modify,move "$VHOST_DIR"; do \
        echo "[grokflow-nginx-reloader] change detected, validating + reloading"; \
        if /usr/sbin/nginx -t 2>&1; then \
            /usr/sbin/nginx -s reload && echo "[grokflow-nginx-reloader] reloaded"; \
        else \
            echo "[grokflow-nginx-reloader] config invalid, skipping reload"; \
        fi; \
        sleep 1; \
    done'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now grokflow-nginx-reloader.service

echo "==> [4/4] Validating + reloading nginx"
nginx -t
systemctl reload nginx

echo
echo "Done."
echo "  Backend writes vhost configs to: $VHOST_DIR"
echo "  Reloader status:  systemctl status grokflow-nginx-reloader"
echo "  Reloader logs:    journalctl -u grokflow-nginx-reloader -f"
echo
echo "Next step: rebuild the backend container (or restart docker-compose)"
echo "so it picks up the new bind mount, then add a domain via /admin → Domains."
