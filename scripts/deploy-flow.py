"""One-shot deploy script for the Flow video-tools (native module).

Run from the developer's laptop. Connects via SSH, uploads a deploy script
via SFTP and executes it under sudo. Pulls latest code, retires the legacy
`flow-api` side-car (if still present), rebuilds backend + frontend,
applies alembic migrations and verifies FFmpeg is on PATH inside the
backend container.

Usage:
    python scripts/deploy-flow.py

Required env (host side, in your shell):
    VPS_HOST, VPS_USER, VPS_PASSWORD, VPS_PROJECT_PATH
"""
from __future__ import annotations

import os
import sys
import textwrap

# Force UTF-8 stdout — Windows defaults to cp1252 which chokes on docker
# pull progress glyphs (U+2819 etc).
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import paramiko  # type: ignore
except ImportError:
    print("Install dependency: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")
ROOT = os.getenv("VPS_PROJECT_PATH", "/home/vpsroot/grokflow")


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)

    script_body = textwrap.dedent(f"""\
        #!/usr/bin/env bash
        set -e
        cd {ROOT}

        echo "=== git pull ==="
        git pull --rebase

        echo "=== retire legacy flow-api side-car if present ==="
        if docker ps -a --format '{{{{.Names}}}}' | grep -q '^grokflow-flow-api-1$'; then
          docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
            stop flow-api || true
          docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
            rm -f flow-api || true
        fi

        echo "=== build backend + frontend ==="
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          build --pull backend frontend

        echo "=== bring up ==="
        docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
          up -d backend frontend

        echo "=== wait for backend healthy ==="
        for i in $(seq 1 30); do
          if docker exec grokflow-backend-1 curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
            echo "backend healthy after ${{i}}s"; break
          fi
          sleep 1
        done

        echo "=== apply alembic migrations ==="
        docker exec grokflow-backend-1 alembic upgrade head

        echo "=== verify ffmpeg + storage ==="
        docker exec grokflow-backend-1 sh -lc 'ffmpeg -version | head -1'
        docker exec grokflow-backend-1 sh -lc 'mkdir -p /app/storage/flow/input /app/storage/flow/output && ls -la /app/storage/flow'

        echo "=== final ps ==="
        docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}'
    """)

    remote_script = "/tmp/grokflow-deploy-flow.sh"
    sftp = client.open_sftp()
    with sftp.open(remote_script, "w") as f:
        f.write(script_body)
    sftp.chmod(remote_script, 0o755)
    sftp.close()

    cmd = f"echo {PASSWORD} | sudo -S bash {remote_script}"
    _, stdout, stderr = client.exec_command(cmd, timeout=1200, get_pty=True)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("STDERR:", err)
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
