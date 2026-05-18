#!/usr/bin/env bash
# warp-init.sh — boot Cloudflare WARP inside the chrome-vnc container.
#
# Why we run this instead of just `warp-svc` directly:
#   - warp-svc takes ~5s to be ready to accept warp-cli commands
#   - First-run registration is mandatory before connecting
#   - We need proxy mode (not full tunnel) so x11vnc / supervisord
#     management traffic stays direct
#   - Re-runs must be idempotent (container restart shouldn't re-register)
#
# Sequencing:
#   1. Start warp-svc in the background (it talks over a unix socket
#      that warp-cli queries; without the daemon every `warp-cli ...`
#      times out)
#   2. Wait for the socket
#   3. Register (no-op if already registered — survives container
#      restarts because /var/lib/cloudflare-warp is in the layer)
#   4. Switch to proxy mode (SOCKS5 on 127.0.0.1:40000)
#   5. Connect — chromium's --proxy-server is then ready

set -euo pipefail

LOG=/tmp/warp-init.log
exec >> "$LOG" 2>&1
echo "[$(date -Iseconds)] warp-init starting"

# Skip entirely if running with reduced caps (NET_ADMIN missing). warp-svc
# will fail with confusing errors otherwise — better to log and exit
# clean so supervisord doesn't restart-loop on us.
if ! capsh --print 2>/dev/null | grep -q "cap_net_admin"; then
    if [[ ! -e /dev/net/tun ]]; then
        echo "[warp-init] no CAP_NET_ADMIN and no /dev/net/tun — skipping (proxy fallback to direct)"
        exit 0
    fi
fi

# Daemon
if ! pgrep -x warp-svc >/dev/null; then
    echo "[warp-init] launching warp-svc"
    /usr/bin/warp-svc &
fi

# Wait up to 20s for the IPC socket to appear.
for _ in $(seq 1 40); do
    if [[ -S /var/run/cloudflare-warp/warp_service ]] \
       || warp-cli --accept-tos status >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Register (idempotent)
echo "[warp-init] registering (idempotent)"
warp-cli --accept-tos registration new 2>&1 \
    || warp-cli --accept-tos register 2>&1 \
    || true

# Proxy mode
echo "[warp-init] setting proxy mode"
warp-cli --accept-tos mode proxy 2>&1 \
    || warp-cli --accept-tos set-mode proxy 2>&1 \
    || true

# Connect
echo "[warp-init] connecting"
warp-cli --accept-tos connect 2>&1 || true

# Verify listener is up before we exit — chromium starts after this
# program (supervisord priority) and would otherwise race the proxy.
for _ in $(seq 1 30); do
    if ss -tln 2>/dev/null | grep -q ":40000\b"; then
        echo "[warp-init] proxy listening on 127.0.0.1:40000 — READY"
        warp-cli --accept-tos status 2>&1 | head -5
        # Keep running so supervisord considers this program healthy.
        # Without this the program exits and supervisord respawns it.
        exec sleep infinity
    fi
    sleep 1
done

echo "[warp-init] WARP failed to bind 127.0.0.1:40000 after 30s — chromium will fall back to direct"
warp-cli --accept-tos status 2>&1 | head -10
exec sleep infinity
