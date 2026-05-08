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

set -euo pipefail

for i in $(seq 1 20); do
    xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
    sleep 0.5
done

URL="${STARTUP_URL:-https://grok.com/}"

exec /usr/bin/chromium \
    --no-sandbox \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --disable-blink-features=AutomationControlled \
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
