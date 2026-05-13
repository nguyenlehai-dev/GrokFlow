FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    USER=vncuser \
    HOME=/home/vncuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium chromium-sandbox \
    xvfb x11vnc autocutsel \
    novnc websockify \
    supervisor nginx-light \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    ca-certificates curl wget procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash vncuser \
    && mkdir -p /config /var/log/supervisor /run/nginx /var/lib/nginx/body \
    && chown -R vncuser:vncuser /config /run/nginx /var/lib/nginx /var/log/nginx

COPY supervisord.conf /etc/supervisor/conf.d/grokflow.conf
COPY entrypoint.sh /entrypoint.sh
COPY launch-chromium.sh /launch-chromium.sh
COPY cdp-proxy.conf /etc/nginx/cdp-proxy.conf
RUN chmod +x /entrypoint.sh /launch-chromium.sh

EXPOSE 6901 9223
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD curl -fsS http://localhost:6901/ || exit 1

CMD ["/entrypoint.sh"]
