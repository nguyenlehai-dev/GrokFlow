#!/usr/bin/env bash
# warp-bootstrap.sh — start Cloudflare WARP in proxy mode inside the
# backend container, then exec the real command (uvicorn / alembic /
# whatever). Used so the backend's httpx outbound calls to grok.com
# route through WARP and appear as Cloudflare-internal traffic — that
# bypasses the IP-reputation flagging that turns plain-VPS requests
# into 403 (provider_blocked) after a few dozen jobs.
#
# Idempotent. Best-effort: if WARP fails to bind (missing CAP_NET_ADMIN
# / no /dev/net/tun on the host), we log + still launch the app so the
# rest of the stack stays up. The app then falls back to direct httpx,
# which works for a while but is what we're trying to avoid.

set -euo pipefail

LOG=/tmp/warp-bootstrap.log
echo "[$(date -Iseconds)] warp-bootstrap starting" | tee -a "$LOG"

# Cap probe — WARP's tunnel needs NET_ADMIN regardless of proxy/tunnel
# mode (it touches the routing table at startup).
HAVE_CAP=true
if ! capsh --print 2>/dev/null | grep -q "cap_net_admin"; then
    HAVE_CAP=false
fi
HAVE_TUN=true
[[ -e /dev/net/tun ]] || HAVE_TUN=false
echo "[warp] cap_net_admin=$HAVE_CAP /dev/net/tun=$HAVE_TUN" | tee -a "$LOG"

if [[ "$HAVE_CAP" == "true" || "$HAVE_TUN" == "true" ]]; then
    if ! pgrep -x warp-svc >/dev/null; then
        echo "[warp] launching warp-svc" | tee -a "$LOG"
        /usr/bin/warp-svc >> "$LOG" 2>&1 &
    fi

    # Wait up to 20s for the IPC socket / status command.
    for _ in $(seq 1 40); do
        if warp-cli --accept-tos status >/dev/null 2>&1; then break; fi
        sleep 0.5
    done

    echo "[warp] register (idempotent)" | tee -a "$LOG"
    (warp-cli --accept-tos registration new 2>>"$LOG" \
        || warp-cli --accept-tos register 2>>"$LOG") || true

    echo "[warp] mode proxy" | tee -a "$LOG"
    (warp-cli --accept-tos mode proxy 2>>"$LOG" \
        || warp-cli --accept-tos set-mode proxy 2>>"$LOG") || true

    echo "[warp] connect" | tee -a "$LOG"
    warp-cli --accept-tos connect 2>>"$LOG" || true

    # Wait for listener; record final state so we can grep the log.
    for _ in $(seq 1 30); do
        if ss -tln 2>/dev/null | grep -q "127.0.0.1:40000"; then
            echo "[warp] proxy listening on 127.0.0.1:40000 — READY" | tee -a "$LOG"
            export GROK_HTTP_PROXY="socks5://127.0.0.1:40000"
            break
        fi
        sleep 1
    done
    if [[ -z "${GROK_HTTP_PROXY:-}" ]]; then
        echo "[warp] WARNING: SOCKS listener never bound — backend will use direct httpx" | tee -a "$LOG"
    fi
else
    echo "[warp] SKIP — container lacks CAP_NET_ADMIN/tun. Add cap_add: [NET_ADMIN] in compose." | tee -a "$LOG"
fi

echo "[$(date -Iseconds)] exec: $*" | tee -a "$LOG"
exec "$@"
