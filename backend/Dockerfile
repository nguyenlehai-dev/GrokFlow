FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl gnupg lsb-release ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Cloudflare WARP — runs as a SOCKS5 proxy at 127.0.0.1:40000 inside this
# container so the backend's outbound httpx calls to grok.com appear to
# come from inside Cloudflare's own network. Without WARP, grok.com's
# Cloudflare edge gradually flags the VPS IP and image-API requests
# start returning 403 (provider_blocked) → the job falls back to
# Playwright DOM (slow) and eventually stalls. Same image + sidecar
# pattern as vnc/Dockerfile.
RUN curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
        | gpg --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ bookworm main" \
        > /etc/apt/sources.list.d/cloudflare-client.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends cloudflare-warp \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# warp-bootstrap.sh handles register + connect + waits for the SOCKS
# listener; then execs uvicorn. Replaces the previous bare uvicorn CMD.
COPY warp-bootstrap.sh /warp-bootstrap.sh
RUN chmod +x /warp-bootstrap.sh

EXPOSE 8000
CMD ["/warp-bootstrap.sh", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
