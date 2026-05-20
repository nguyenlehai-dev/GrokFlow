#!/usr/bin/env bash
# install_watcher_keepalive.sh — cron-based keepalive for the
# grokflow-nginx-reload.path systemd unit.
#
# Why this exists
# ---------------
# The .path unit watching /etc/nginx/grokflow-vhosts/ for VNC-map
# changes has died twice now (entering "failed" state) for reasons
# we haven't fully tracked down — once after a stop ordering cycle
# (already fixed via Requires→Wants), and once again after a burst
# of container restarts. When it dies:
#   - backend writes the map fine
#   - host nginx doesn't reload
#   - /vnc/<short>/ routes serve a stale upstream → 502
#   - users can't open Auto-login iframes
#
# Rather than continue chasing a perfect-stay-up systemd config, just
# run a cron job every 5 min that checks the unit is active and
# restarts it if not. Idempotent, cheap, survives anything.
#
# Installs:
#   /usr/local/bin/grokflow-watcher-keepalive.sh
#   /etc/cron.d/grokflow-watcher-keepalive
#
# IDEMPOTENT — safe to re-run.
#
# Usage:
#   sudo bash deploy/install_watcher_keepalive.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo bash $0)" >&2
    exit 1
fi

KEEPALIVE_BIN="/usr/local/bin/grokflow-watcher-keepalive.sh"
CRON_FILE="/etc/cron.d/grokflow-watcher-keepalive"

cat > "$KEEPALIVE_BIN" <<'EOF'
#!/usr/bin/env bash
# Keep grokflow-nginx-reload.path active. If it ever leaves
# 'active' state (failed / inactive / dead), restart it and
# force one nginx reload to catch up on any map changes that
# happened while the watcher was down.
set -uo pipefail

UNIT=grokflow-nginx-reload.path

STATE=$(systemctl is-active "$UNIT" 2>/dev/null || echo "unknown")
if [[ "$STATE" == "active" ]]; then
    # All good. Silent exit so cron doesn't email every 5 min.
    exit 0
fi

logger -t grokflow-watcher-keepalive "watcher state=$STATE — restarting"

if systemctl restart "$UNIT"; then
    logger -t grokflow-watcher-keepalive "watcher restarted; reloading nginx to catch up"
    # Also force one nginx reload so any map drift that happened
    # while the watcher was down gets applied immediately.
    if nginx -t >/dev/null 2>&1; then
        nginx -s reload && \
            logger -t grokflow-watcher-keepalive "nginx reloaded"
    else
        logger -t grokflow-watcher-keepalive "nginx -t failed; SKIPPING reload"
    fi
else
    logger -t grokflow-watcher-keepalive "ERROR: failed to restart watcher"
    exit 1
fi
EOF
chmod 755 "$KEEPALIVE_BIN"

# Cron entry — every 5 min. Cheap (just 1 systemctl is-active probe
# when healthy). Logger output goes to /var/log/syslog under tag
# grokflow-watcher-keepalive.
cat > "$CRON_FILE" <<EOF
# Keep the GrokFlow nginx-reload path watcher alive. Auto-restart
# every 5 min if it ever drops out of 'active' state.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

*/5 * * * * root ${KEEPALIVE_BIN} >/dev/null 2>&1
EOF
chmod 644 "$CRON_FILE"

# Run once now so we don't have to wait 5 min for the first check.
"$KEEPALIVE_BIN" || true

echo "Installed."
echo "  Script: $KEEPALIVE_BIN"
echo "  Cron:   $CRON_FILE  (runs every 5 min)"
echo
echo "Watch logs with: journalctl -t grokflow-watcher-keepalive -f"
echo "Current watcher state: $(systemctl is-active grokflow-nginx-reload.path)"
