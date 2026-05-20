#!/usr/bin/env bash
# install_nginx_watcher.sh — auto-reload nginx when GrokFlow backend
# rewrites the VNC short_id → container IP map.
#
# Why this exists:
#   The backend writes /etc/nginx/grokflow-vhosts/_vnc_map.conf each time a
#   VNC container is spawned / torn down. Nginx caches `map` directives at
#   load time, so the new entries are invisible until nginx receives
#   SIGHUP. The backend container has no privilege to signal the host
#   nginx, so a host-side watcher is the cleanest bridge.
#
# What it installs:
#   /etc/systemd/system/grokflow-nginx-reload.path     — inotify watcher
#   /etc/systemd/system/grokflow-nginx-reload.service  — `nginx -s reload`
#
# After install, every map change reloads nginx in <1s. One-shot setup;
# safe to re-run (idempotent).
#
# Usage:
#   sudo bash deploy/install_nginx_watcher.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo bash $0)" >&2
    exit 1
fi

MAP_FILE="/etc/nginx/grokflow-vhosts/_vnc_map.conf"
SERVICE_PATH="/etc/systemd/system/grokflow-nginx-reload.service"
PATH_UNIT_PATH="/etc/systemd/system/grokflow-nginx-reload.path"

cat > "$SERVICE_PATH" <<'EOF'
[Unit]
Description=Reload nginx after GrokFlow VNC map change
After=nginx.service
# Wants (not Requires) — Requires creates an ordering cycle when systemd
# tries to stop both units (path → service → nginx → path), which it
# auto-breaks by killing the path unit. Result: watcher dies the first
# time nginx is restarted (deploy / package update), map changes stop
# triggering reloads, /vnc/<short>/ 502s. Wants gives the same start-up
# guarantee without the stop-time cycle.
Wants=nginx.service

[Service]
Type=oneshot
# Validate before reload — a bad map would otherwise nuke prod nginx.
ExecStart=/usr/sbin/nginx -t
ExecStart=/usr/sbin/nginx -s reload
EOF

cat > "$PATH_UNIT_PATH" <<EOF
[Unit]
Description=Watch GrokFlow nginx vhost directory for changes
After=nginx.service

[Path]
# PathChanged on the directory fires when any *.conf inside it is
# modified, created, or removed — covers both _vnc_map.conf (the
# auto-generated short_id → container IP map) AND the per-domain
# vhost files written by services/nginx_sync.write_vhost(). Without
# the directory-level watch, adding a domain in the admin UI created
# the vhost file but never reloaded nginx, so the new hostname stayed
# dark until something else (Auto-login spawning a VNC) happened to
# touch _vnc_map.conf.
PathChanged=$(dirname "$MAP_FILE")
Unit=grokflow-nginx-reload.service

[Install]
WantedBy=multi-user.target
EOF

# Make sure the map file exists so the path unit can attach to it.
mkdir -p "$(dirname "$MAP_FILE")"
[[ -f "$MAP_FILE" ]] || {
    cat > "$MAP_FILE" <<'EOF'
# Auto-generated placeholder — backend will rewrite on first VNC spawn.
map $vnc_short $vnc_upstream {
    default "_none_";
}
EOF
}

systemctl daemon-reload
systemctl enable --now grokflow-nginx-reload.path

echo
echo "Installed. Status:"
systemctl status grokflow-nginx-reload.path --no-pager | head -8
