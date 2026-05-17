#!/usr/bin/env bash
# Launch Chromium with remote-debugging port + memory-optimized flags.
# This browser passes Cloudflare via real user login; worker connects to it
# via CDP (port 9222 → nginx proxy 9223 with Host rewrite).
#
# Memory tuning (multi-tab friendly):
#   --memory-pressure-off          — don't throttle on host pressure (we manage)
#   --js-flags="--max-old-space-size=512" — cap V8 heap per renderer
#   --disable-features=...         — kill background work that wastes RAM
#   --aggressive-cache-discard     — drop unused caches sooner
#   --renderer-process-limit=8     — cap renderer count (one per tab)
#
# IMPORTANT — we call the chromium BINARY directly (/usr/lib/chromium/chromium),
# not the /usr/bin/chromium wrapper. The wrapper sources /etc/chromium.d/*
# which on Debian/Ubuntu injects extra flags including:
#
#   --load-extension=`ls -dm /usr/share/chromium/extensions/*`
#
# When that directory is empty (our case), `ls` returns nothing and we end
# up with `--load-extension=` (empty value). Chromium then treats the
# NEXT positional arg ($URL) as the extension path. Result: no startup URL
# AND a Cloudflare-detectable automation fingerprint. Bypassing the wrapper
# gives us deterministic flags.

set -euo pipefail

for i in $(seq 1 20); do
    xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
    sleep 0.5
done

URL="${STARTUP_URL:-https://grok.com/}"

# Explicit unset of any flag inheritance.
unset CHROMIUM_FLAGS

# Outbound proxy. Three sources, in priority order:
#   1. $GROK_HTTP_PROXY env var explicitly set by caller
#   2. Sibling Cloudflare WARP daemon (warp-init.sh in this container)
#      listening on 127.0.0.1:40000 — wait up to 20s for it to bind
#   3. None — direct connection
# WARP makes outbound look like it's coming from Cloudflare's own
# network so Turnstile / bot-walls relax dramatically.
PROXY_ARG=""
if [[ -n "${GROK_HTTP_PROXY:-}" ]]; then
    PROXY_ARG="--proxy-server=${GROK_HTTP_PROXY}"
    echo "[launch] chromium will route via env proxy: ${GROK_HTTP_PROXY}" >&2
else
    # Wait briefly for the sibling WARP supervisord program — chromium
    # starts at priority 400 while warp at 50, but warp's connect step
    # can lag the priority gate. 20s is the same budget warp-init uses.
    for _ in $(seq 1 20); do
        if ss -tln 2>/dev/null | grep -q "127.0.0.1:40000"; then
            PROXY_ARG="--proxy-server=socks5://127.0.0.1:40000"
            echo "[launch] using local WARP proxy 127.0.0.1:40000" >&2
            break
        fi
        sleep 1
    done
    [[ -z "$PROXY_ARG" ]] && echo "[launch] no WARP proxy reachable — direct connection" >&2
fi

exec /usr/lib/chromium/chromium \
    ${PROXY_ARG} \
    --no-sandbox \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --disable-blink-features=AutomationControlled \
    --force-device-scale-factor=1 \
    --high-dpi-support=0 \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --remote-allow-origins=* \
    --user-data-dir=/config \
    --window-position=0,0 \
    --window-size=1366,768 \
    --start-maximized \
    --memory-pressure-off \
    --aggressive-cache-discard \
    --disable-features=Translate,BackForwardCache,InterestFeedContentSuggestions,CalculateNativeWinOcclusion \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    --disable-backgrounding-occluded-windows \
    --disable-extensions \
    --disable-component-update \
    --disable-default-apps \
    --renderer-process-limit=8 \
    --js-flags="--max-old-space-size=512" \
    "$URL"
