FROM python:3.12-slim

# FFmpeg + git (git only needed at build to pull upstream)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upstream pin — bump SHA when you want to ingest new changes
ARG UPSTREAM_REPO=https://github.com/nguyenlehai-dev/video-processing-service.git
ARG UPSTREAM_REF=main
RUN git clone --depth=1 --branch ${UPSTREAM_REF} ${UPSTREAM_REPO} /tmp/upstream && \
    cp -r /tmp/upstream/. /app/ && \
    rm -rf /tmp/upstream /app/.git

RUN pip install --no-cache-dir -r requirements.txt

# Sidecar overlay — patches storage_service + video_service to support
# local-filesystem input (upstream hard-requires R2). Adds /jobs/init-local
# multipart endpoint so the FE can upload directly without R2 credentials.
# Bootstrap script provisions an admin user + API key on first boot.
COPY sidecar.py /app/sidecar.py
COPY bootstrap.py /app/bootstrap.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && \
    mkdir -p /app/data /app/data/input /tmp/video-processing

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["/app/entrypoint.sh"]
