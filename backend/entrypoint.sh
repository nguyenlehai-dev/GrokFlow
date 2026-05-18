#!/usr/bin/env bash
# Run as root to fix volume permissions, grant docker socket access,
# bring up the Cloudflare WARP daemon (so httpx calls to grok.com route
# through Cloudflare's network and skip the bot wall), then drop to
# grokflow user.
set -euo pipefail

start_warp() {
    # WARP needs CAP_NET_ADMIN — granted via compose `cap_add: [NET_ADMIN]`.
    # If the container is run without it (dev / tests), we log and skip
    # so the app still boots; provider code falls back to direct httpx.
    if ! capsh --print 2>/dev/null | grep -q "cap_net_admin"; then
        echo "[entrypoint] no CAP_NET_ADMIN — skipping WARP (direct httpx fallback)"
        return 0
    fi
    if [[ ! -e /dev/net/tun ]]; then
        echo "[entrypoint] /dev/net/tun missing — skipping WARP"
        return 0
    fi
    if ! command -v warp-svc >/dev/null 2>&1; then
        echo "[entrypoint] warp-svc not installed — skipping"
        return 0
    fi
    if ! pgrep -x warp-svc >/dev/null 2>&1; then
        /usr/bin/warp-svc >/tmp/warp-svc.log 2>&1 &
    fi
    # Wait up to 20s for the IPC socket / status command to respond.
    for _ in $(seq 1 40); do
        if warp-cli --accept-tos status >/dev/null 2>&1; then break; fi
        sleep 0.5
    done
    (warp-cli --accept-tos registration new 2>/dev/null \
        || warp-cli --accept-tos register 2>/dev/null) || true
    (warp-cli --accept-tos mode proxy 2>/dev/null \
        || warp-cli --accept-tos set-mode proxy 2>/dev/null) || true
    warp-cli --accept-tos connect 2>/dev/null || true
    # Block until SOCKS bound, then export the env var the provider
    # reads from `_httpx_proxy_kwargs()`. Cap at 25s so a stuck WARP
    # doesn't block the API from coming up.
    for _ in $(seq 1 50); do
        if ss -tln 2>/dev/null | grep -q "127.0.0.1:40000"; then
            echo "[entrypoint] WARP ready — exporting GROK_HTTP_PROXY"
            export GROK_HTTP_PROXY="socks5://127.0.0.1:40000"
            return 0
        fi
        sleep 0.5
    done
    echo "[entrypoint] WARP failed to bind 127.0.0.1:40000 — direct httpx fallback"
}

if [[ "$(id -u)" == "0" ]]; then
    chown -R grokflow:grokflow /app/storage /app/browser_profiles 2>/dev/null || true

    # If Docker socket is mounted, ensure grokflow can talk to it by
    # joining the host's docker group (whatever its GID happens to be).
    if [[ -S /var/run/docker.sock ]]; then
        DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
        if ! getent group dockerhost >/dev/null; then
            groupadd -g "$DOCKER_GID" dockerhost 2>/dev/null \
              || groupadd dockerhost  # GID collision fallback
        fi
        usermod -aG dockerhost grokflow 2>/dev/null || true
    fi

    start_warp

    # gosu --preserve-env keeps GROK_HTTP_PROXY (and the rest of the
    # current env) on the grokflow side so provider code sees it.
    exec gosu grokflow env GROK_HTTP_PROXY="${GROK_HTTP_PROXY:-}" "$@"
fi
exec "$@"
