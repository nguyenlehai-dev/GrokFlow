FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    USER=vncuser \
    HOME=/home/vncuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium chromium-sandbox \
    xvfb x11vnc \
    novnc websockify \
    supervisor nginx-light \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    ca-certificates curl wget procps \
    xdotool \
    python3 python3-websocket \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash vncuser \
    && mkdir -p /config /var/log/supervisor /run/nginx /var/lib/nginx/body \
    && chown -R vncuser:vncuser /config /run/nginx /var/lib/nginx /var/log/nginx

# autocutsel in its own tiny layer so the big chromium+xvfb apt download
# above stays cacheable — adding autocutsel inline would invalidate the
# 600 MB-of-Debian-packages layer and force a full redownload over the
# VPS's 10 Mbps international link.
RUN apt-get update && apt-get install -y --no-install-recommends \
    autocutsel \
    && rm -rf /var/lib/apt/lists/*

COPY supervisord.conf /etc/supervisor/conf.d/grokflow.conf
COPY entrypoint.sh /entrypoint.sh
COPY launch-chromium.sh /launch-chromium.sh
COPY stealth_injector.py /usr/local/bin/stealth_injector.py
COPY cdp-proxy.conf /etc/nginx/cdp-proxy.conf
# Debian noVNC strips package.json (which ui.js fetches for version display).
# Add a stub so the browser console doesn't spam 404s + "Couldn't fetch
# package.json" errors. Also strip the <link rel="preload"> tags for SVGs
# that fire benign "preloaded but not used" warnings (noVNC only uses them
# on connection errors, which Chrome can't predict from the preload hint).
RUN printf '{"name":"noVNC","version":"1.4.0"}\n' > /usr/share/novnc/package.json \
    && sed -i '/<link rel="preload"/d' /usr/share/novnc/vnc.html
RUN chmod +x /entrypoint.sh /launch-chromium.sh

EXPOSE 6901 9223
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD curl -fsS http://localhost:6901/ || exit 1

CMD ["/entrypoint.sh"]
