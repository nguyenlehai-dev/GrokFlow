#!/usr/bin/env bash
# install_warp_watchdog.sh — host-side WARP self-heal for grok.com.
#
# Why this exists
# ---------------
# WARP exits sit behind Cloudflare's own IPs. Cloudflare aggressively
# rate-limits / 403's its own egress range when Grok detects abuse
# patterns (rapid /conversations/new calls). When that happens the
# stream from grok.com to our chromium gets truncated mid-response and
# every job fails with "stream ended without a completed image_chunk".
# A simple `systemctl restart warp-svc` rotates the exit IP and almost
# always lands on a clean one — but nobody is awake to do this at 03 AM.
#
# What this installs
# ------------------
#   /usr/local/bin/grokflow-warp-watchdog.sh   — probe + restart logic
#   /etc/systemd/system/grokflow-warp-watchdog.timer  — runs every 15 min
#   /etc/systemd/system/grokflow-warp-watchdog.service — oneshot exec
#
# The watchdog probes grok.com THROUGH the WARP socks5 proxy. A 403/000
# return triggers a `systemctl restart warp-svc`. To prevent runaway
# loops (CF might be flagging the WHOLE WARP egress range), a state
# file caps restarts at 1 per 30 minutes.
#
# Host-side, NOT inside docker, on purpose:
#   - survives `docker compose down/up`, deploys, container recreates
#   - has the privilege to call systemctl
#   - decoupled from app lifecycle — even if the GrokFlow stack is dead,
#     WARP stays in good shape for the next bring-up
#
# IDEMPOTENT — safe to re-run. Use after every server provision.
#
# Usage:
#   sudo bash deploy/install_warp_watchdog.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo bash $0)" >&2
    exit 1
fi

WATCHDOG_BIN="/usr/local/bin/grokflow-warp-watchdog.sh"
SERVICE_PATH="/etc/systemd/system/grokflow-warp-watchdog.service"
TIMER_PATH="/etc/systemd/system/grokflow-warp-watchdog.timer"
WARP_PORT="${WARP_PORT:-40000}"
# Probe an unprotected endpoint, NOT grok.com. Earlier version probed
# grok.com directly — but grok.com always serves a Cloudflare Turnstile
# challenge (HTTP 403 with `Just a moment...` HTML) for plain curl,
# regardless of whether WARP itself is healthy. The challenge is
# expected — Chromium-with-cookies inside our VNC containers passes it
# normally. So a Turnstile 403 is NOT a signal to restart WARP; it's a
# signal that "curl is not a real browser". Probe Cloudflare's
# own trace endpoint instead: returns 200 with plain text, no
# Turnstile, no DDoS protection. If WARP can't reach THIS, WARP is
# truly broken.
PROBE_URL="${PROBE_URL:-https://www.cloudflare.com/cdn-cgi/trace}"
COOLDOWN_SEC="${COOLDOWN_SEC:-1800}"

cat > "$WATCHDOG_BIN" <<EOF
#!/usr/bin/env bash
# Probe \${PROBE_URL} via WARP socks5. Restart warp-svc on 403/000.
# Cooldown: at most one restart per \${COOLDOWN_SEC}s — prevents CF-flagged-
# whole-range scenarios from melting the host with restart loops.
set -uo pipefail

PROBE_URL="${PROBE_URL}"
WARP_PORT="${WARP_PORT}"
COOLDOWN_SEC=${COOLDOWN_SEC}
STATE_FILE="/var/lib/grokflow-warp-watchdog.last_restart"

CODE=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 \\
    --socks5 127.0.0.1:\${WARP_PORT} "\${PROBE_URL}" 2>/dev/null || echo 000)

# Only restart when WARP itself can't reach the open internet — 000
# (connect/timeout) or 5xx (gateway issue). 2xx/3xx/4xx all mean the
# probe got an HTTP response → WARP socks5 → DNS → TLS → HTTP all
# working → no reason to bounce the daemon.
if [[ "\$CODE" != "000" && ! "\$CODE" =~ ^5 ]]; then
    logger -t grokflow-warp-watchdog "ok (code=\$CODE)"
    exit 0
fi

NOW=\$(date +%s)
LAST=\$(cat "\$STATE_FILE" 2>/dev/null || echo 0)
ELAPSED=\$(( NOW - LAST ))
if (( ELAPSED < COOLDOWN_SEC )); then
    logger -t grokflow-warp-watchdog "degraded (code=\$CODE) but cooldown active (\${ELAPSED}s < \${COOLDOWN_SEC}s)"
    exit 0
fi

logger -t grokflow-warp-watchdog "degraded (code=\$CODE) — restarting warp-svc"
if systemctl restart warp-svc; then
    echo "\$NOW" > "\$STATE_FILE"
    logger -t grokflow-warp-watchdog "warp-svc restarted"
else
    logger -t grokflow-warp-watchdog "restart FAILED — needs manual intervention"
    exit 1
fi
EOF
chmod 755 "$WATCHDOG_BIN"

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Probe grok.com via WARP and restart warp-svc on Cloudflare block
After=warp-svc.service network-online.target

[Service]
Type=oneshot
ExecStart=${WATCHDOG_BIN}
EOF

cat > "$TIMER_PATH" <<EOF
[Unit]
Description=Run grokflow-warp-watchdog every 15 minutes

[Timer]
# 15-min cadence is short enough to recover quickly but long enough that
# transient hiccups don't immediately trigger a restart (the watchdog's
# own 30-min cooldown gives the secondary backstop).
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true
Unit=grokflow-warp-watchdog.service

[Install]
WantedBy=timers.target
EOF

# Initialise state file so the first run isn't blocked by missing-file
# weirdness on `cat`.
install -d -m 755 /var/lib
[[ -f /var/lib/grokflow-warp-watchdog.last_restart ]] \
    || echo 0 > /var/lib/grokflow-warp-watchdog.last_restart

systemctl daemon-reload
systemctl enable --now grokflow-warp-watchdog.timer

echo
echo "Installed. Timer status:"
systemctl status grokflow-warp-watchdog.timer --no-pager | head -8
echo
echo "Next runs:"
systemctl list-timers grokflow-warp-watchdog.timer --no-pager
echo
echo "Tail logs with:  journalctl -t grokflow-warp-watchdog -f"
