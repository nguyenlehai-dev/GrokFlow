#!/usr/bin/env bash
# install_warp_proxy.sh — install Cloudflare WARP on the VPS host in proxy
# mode, then expose its SOCKS5 listener on the Docker bridge so VNC
# containers (which can't easily install WARP themselves without
# CAP_NET_ADMIN) can route grok.com traffic through it.
#
# WHY:
#   Grok puts Cloudflare Turnstile in front of grok.com. Cloudflare's
#   bot-detection on VPS IPs is harsh — the spinner shows "Verifying…"
#   indefinitely no matter what stealth flags we put on chromium. Routing
#   our chromium's traffic through WARP makes it look like the request is
#   coming from inside Cloudflare's own network, so the same Cloudflare
#   that protects grok.com trusts itself and skips the harder checks.
#
# WHAT THIS DOES:
#   1. Install warp-cli + warp-svc from Cloudflare's apt repo
#   2. Register WARP (anonymous — no account needed)
#   3. Switch WARP into `proxy` mode (default is full tunnel; we only
#      want a SOCKS5 listener so other traffic on the box stays direct)
#   4. Bring it up — listens on 127.0.0.1:40000
#   5. Install a tiny systemd-managed socat bridge that re-publishes
#      that listener on 172.30.0.1:40000 (Docker bridge gateway) so the
#      chrome-vnc containers can reach it from inside their network
#
# AFTER INSTALL:
#   Set `GROK_HTTP_PROXY=socks5://172.30.0.1:40000` in .env.prod, then
#   restart the VNC containers — launch-chromium.sh picks up the var
#   and adds `--proxy-server=$GROK_HTTP_PROXY` to chromium's flags.
#
# IDEMPOTENT — safe to re-run.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo bash $0)" >&2
    exit 1
fi

BRIDGE_GW="${BRIDGE_GW:-172.30.0.1}"
WARP_PORT="${WARP_PORT:-40000}"

# ── 1) Install WARP package ────────────────────────────────────────────
if ! command -v warp-cli >/dev/null 2>&1; then
    echo "[warp] adding Cloudflare apt repo"
    curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
        | gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
    CODENAME="$(lsb_release -cs)"
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ ${CODENAME} main" \
        > /etc/apt/sources.list.d/cloudflare-client.list
    apt-get update
    apt-get install -y cloudflare-warp socat
else
    echo "[warp] warp-cli already installed: $(warp-cli --version 2>/dev/null || true)"
    # socat may still be missing on a re-run.
    command -v socat >/dev/null 2>&1 || apt-get install -y socat
fi

# ── 2) Register (anonymous) ────────────────────────────────────────────
# `warp-cli registration new` is the modern command; older versions used
# `register`. Try both, ignore "already registered" errors.
if ! warp-cli status 2>&1 | grep -q "Registration"; then
    echo "[warp] registering"
    (warp-cli --accept-tos registration new 2>/dev/null || warp-cli register --accept-tos 2>/dev/null) || true
fi

# ── 3) Proxy mode (default is full-tunnel "warp" mode) ─────────────────
echo "[warp] switching to proxy mode"
warp-cli --accept-tos mode proxy 2>/dev/null \
    || warp-cli set-mode proxy 2>/dev/null \
    || echo "[warp] mode command failed — older warp-cli may differ"

# ── 4) Connect ─────────────────────────────────────────────────────────
echo "[warp] connecting"
warp-cli --accept-tos connect 2>/dev/null || warp-cli connect 2>/dev/null || true

# Wait a few seconds for the SOCKS listener to bind.
for _ in $(seq 1 10); do
    if ss -tlnp 2>/dev/null | grep -q ":${WARP_PORT}\b"; then break; fi
    sleep 1
done

if ! ss -tlnp 2>/dev/null | grep -q ":${WARP_PORT}\b"; then
    echo "[warp] WARNING: no listener on 127.0.0.1:${WARP_PORT} — proxy may not be running"
    warp-cli status 2>&1 | head -20
fi

# ── 5) socat bridge so docker bridge can reach it ──────────────────────
# warp-svc binds to 127.0.0.1 only. We need containers on grokflow_default
# (172.30.0.0/24) to reach it, so forward bridge_gw:40000 → 127.0.0.1:40000.
cat > /etc/systemd/system/grokflow-warp-bridge.service <<EOF
[Unit]
Description=Expose WARP SOCKS proxy on Docker bridge for grokflow containers
After=cloudflare-warp.service docker.service
Requires=cloudflare-warp.service

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP4-LISTEN:${WARP_PORT},reuseaddr,fork,bind=${BRIDGE_GW} TCP:127.0.0.1:${WARP_PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now grokflow-warp-bridge.service

# ── Verify ─────────────────────────────────────────────────────────────
echo
echo "── status ─────────────────────────────────────────────"
warp-cli status 2>&1 | head -10
echo
systemctl is-active grokflow-warp-bridge.service
ss -tlnp 2>/dev/null | grep ":${WARP_PORT}\b" || echo "(socat not yet listening)"
echo
echo "[warp] DONE. Add to .env.prod:"
echo "    GROK_HTTP_PROXY=socks5://${BRIDGE_GW}:${WARP_PORT}"
echo "Then restart VNC containers to pick it up."
