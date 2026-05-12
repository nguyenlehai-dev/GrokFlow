"""One-shot deploy script for the Flow video-tools side-car.

Run from the developer's laptop (not on the VPS). Connects via SSH, pulls
latest code, ensures the FLOW_* env block exists in .env.prod (auto-
generating secrets if missing), rebuilds the three services that changed
and verifies the bootstrap key landed.

Usage:
    python scripts/deploy-flow.py

Required env (host side, in your shell):
    VPS_HOST, VPS_USER, VPS_PASSWORD, VPS_PROJECT_PATH
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import textwrap

try:
    import paramiko  # type: ignore
except ImportError:
    print("Install dependency: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")
ROOT = os.getenv("VPS_PROJECT_PATH", "/home/vpsroot/grokflow")


def run(client: "paramiko.SSHClient", cmd: str, timeout: int = 300) -> str:
    """Run via sudo bash -c, capture combined stdout."""
    full = f"echo {PASSWORD} | sudo -S bash -c {json.dumps(cmd)}"
    stdin, stdout, stderr = client.exec_command(full, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out + ("\n" + err if err.strip() else "")


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)

    flow_key = secrets.token_hex(32)
    flow_pw = secrets.token_hex(16)

    script = textwrap.dedent(f"""
        set -e
        cd {ROOT}
        echo === git pull ===
        git pull --rebase

        echo === ensure FLOW_* env block ===
        if ! grep -q '^FLOW_SECRET_KEY=' .env.prod; then
          cat >> .env.prod <<'EOF'

# ─── Flow API (added by scripts/deploy-flow.py) ──
FLOW_SECRET_KEY={flow_key}
FLOW_BOOTSTRAP_EMAIL=flow-admin@grokflow.local
FLOW_BOOTSTRAP_USERNAME=flowadmin
FLOW_BOOTSTRAP_PASSWORD={flow_pw}
FLOW_MAX_UPLOAD_MB=500
FLOW_R2_ACCOUNT_ID=
FLOW_R2_ACCESS_KEY_ID=
FLOW_R2_SECRET_ACCESS_KEY=
FLOW_R2_BUCKET_NAME=video-output
FLOW_R2_PUBLIC_URL=
EOF
          echo 'FLOW_* env appended'
        else
          echo 'FLOW_* env already present, skipping'
        fi

        echo === build images ===
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          build --pull flow-api backend frontend

        echo === bring up ===
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          up -d flow-api backend frontend

        echo === wait for bootstrap ===
        sleep 20
        docker logs grokflow-flow-api-1 --tail 30 || true

        echo === verify api key file ===
        docker exec grokflow-flow-api-1 sh -c 'wc -c /app/data/.api-key 2>/dev/null || echo MISSING'

        echo === verify backend can reach flow-api ===
        docker exec grokflow-backend-1 sh -c \\
          'python -c "import urllib.request; print(urllib.request.urlopen(\\"http://flow-api:8000/health\\", timeout=5).read().decode())"' \\
          || echo "backend->flow-api health check failed"

        echo === final ps ===
        docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}'
    """)

    print(run(client, script, timeout=600))
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
