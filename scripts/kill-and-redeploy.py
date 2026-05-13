"""Kill the running --no-cache build and retry with a cached-friendly Dockerfile.

We split ffmpeg into its own RUN layer in Dockerfile.prod so the original
600-800 MB graphics-stack apt layer stays cached. The new build only has
to download ffmpeg (~200 MB) instead of everything.
"""
from __future__ import annotations

import os
import sys
import textwrap

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")
ROOT = os.getenv("VPS_PROJECT_PATH", "/home/vpsroot/grokflow")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

script = textwrap.dedent(f"""\
    #!/usr/bin/env bash
    set -e
    cd {ROOT}

    echo "=== killing existing --no-cache build ==="
    pkill -f 'docker compose.*build' || true
    # buildkit child takes a moment to clean up
    sleep 3
    docker builder prune -f --filter type=exec.cachemount 2>/dev/null || true

    echo "=== git pull (Dockerfile split) ==="
    git pull --rebase

    echo "=== build backend (cache-friendly) ==="
    # No --no-cache — the original graphics-stack apt layer is still
    # cached from 3 hours ago. Only the new thin ffmpeg layer downloads.
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      build backend

    echo "=== recreate backend container ==="
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      up -d --force-recreate backend

    echo "=== wait for backend healthy ==="
    for i in $(seq 1 90); do
      if docker exec grokflow-backend-1 curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
        echo "backend healthy after ${{i}}s"; break
      fi
      sleep 1
    done

    echo "=== alembic upgrade head ==="
    docker exec grokflow-backend-1 alembic upgrade head

    echo "=== verify ==="
    echo -n "ffmpeg: "; docker exec grokflow-backend-1 sh -lc 'ffmpeg -version | head -1'
    echo -n "alembic head: "; docker exec grokflow-backend-1 alembic current 2>&1 | tail -1
    echo -n "flow_jobs table: "; docker exec grokflow-postgres-1 psql -U grokflow -d grokflow -tAc \\
      "SELECT to_regclass('public.flow_jobs')"

    echo "=== final ps ==="
    docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}'
""")

sftp = c.open_sftp()
with sftp.open("/tmp/grokflow-kill-redeploy.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/grokflow-kill-redeploy.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/grokflow-kill-redeploy.sh",
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
