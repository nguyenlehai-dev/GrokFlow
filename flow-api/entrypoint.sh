#!/usr/bin/env bash
# Run upstream FastAPI app with sidecar patches applied at import time.
# Bootstrap step creates the admin user + API key once per data volume.
set -euo pipefail

python /app/bootstrap.py || echo "[entrypoint] bootstrap skipped/failed (non-fatal): $?"

# `sidecar` imports `app.main` so its monkey-patches land before uvicorn
# starts the request loop.
exec uvicorn sidecar:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'
