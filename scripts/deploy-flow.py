"""Deploy script for the native Flow module.

Run from the developer's laptop. Pulls latest code on VPS, force-rebuilds
the backend image (so the new `ffmpeg` apt-get layer actually lands),
restarts services, applies alembic migrations, removes the legacy
flow-api side-car container if it's still hanging around.

Usage:
    python scripts/deploy-flow.py

Required env (host side):
    VPS_HOST, VPS_USER, VPS_PASSWORD, VPS_PROJECT_PATH
"""
from __future__ import annotations

import os
import sys
import textwrap

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import paramiko  # type: ignore
except ImportError:
    print("pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")
ROOT = os.getenv("VPS_PROJECT_PATH", "/home/vpsroot/grokflow")


def main() -> int:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

    script_body = textwrap.dedent(f"""\
        #!/usr/bin/env bash
        set -e
        cd {ROOT}

        echo "=== git pull ==="
        git pull --rebase

        echo "=== retire legacy flow-api side-car if present ==="
        if docker ps -a --format '{{{{.Names}}}}' | grep -q '^grokflow-flow-api-1$'; then
          docker rm -f grokflow-flow-api-1 || true
        fi
        # Drop the now-orphan named volume too (input/output served by backend now).
        docker volume rm grokflow_flow_api_data 2>/dev/null || true

        echo "=== build backend (force fresh apt layer for ffmpeg) ==="
        # Without --no-cache the COPY/RUN lines hit cache and the new
        # ffmpeg in apt-get install never lands.
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          build --no-cache backend
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          build frontend

        echo "=== restart services ==="
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          up -d backend frontend

        echo "=== wait for backend healthy ==="
        for i in $(seq 1 60); do
          if docker exec grokflow-backend-1 curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
            echo "backend healthy after ${{i}}s"; break
          fi
          sleep 1
        done

        echo "=== alembic upgrade head ==="
        docker exec grokflow-backend-1 alembic upgrade head

        echo "=== sanity checks ==="
        echo -n "ffmpeg: "; docker exec grokflow-backend-1 sh -lc 'ffmpeg -version | head -1'
        echo -n "alembic: "; docker exec grokflow-backend-1 alembic current 2>&1 | tail -1
        echo -n "flow_jobs table: "; docker exec grokflow-postgres-1 psql -U grokflow -d grokflow -tAc \\
          "SELECT to_regclass('public.flow_jobs')"

        echo "=== final ps ==="
        docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}'
    """)

    sftp = c.open_sftp()
    with sftp.open("/tmp/grokflow-deploy-flow.sh", "w") as f:
        f.write(script_body)
    sftp.chmod("/tmp/grokflow-deploy-flow.sh", 0o755)
    sftp.close()

    # No pty, generous read timeout — paramiko's default tripped mid-stream
    # on previous runs because docker pull/build emits dense output.
    _, stdout, _ = c.exec_command(
        f"echo {PASSWORD} | sudo -S bash /tmp/grokflow-deploy-flow.sh",
        timeout=1800,
    )
    stdout.channel.settimeout(1800.0)
    data = b""
    while True:
        chunk = stdout.channel.recv(65536)
        if not chunk:
            break
        data += chunk
    print(data.decode("utf-8", errors="replace"))
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
