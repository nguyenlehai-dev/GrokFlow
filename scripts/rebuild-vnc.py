"""Rebuild the chrome-vnc image and recreate every running VNC container.

Run after vnc/* changes so existing per-profile containers pick up the
new image. Backend keeps existing CDP connections by spawning fresh VNC
containers as users re-open profiles — but to make the switch immediate
for an active session we recreate the running ones in place.
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

    echo "=== git pull ==="
    git pull --rebase

    echo "=== build chrome-vnc image ==="
    docker build -t grokflow/chrome-vnc:latest ./vnc

    echo "=== rebuild frontend (nginx config changed) ==="
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      build frontend
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      up -d frontend

    echo "=== recreate active VNC containers (preserve names + volume) ==="
    for cname in $(docker ps --filter name=grokflow-vnc --format '{{{{.Names}}}}'); do
      echo "--- $cname ---"
      # Pull the host-side bind paths off the running container so we can
      # reproduce the spawn exactly.
      profile_path=$(docker inspect "$cname" --format '{{{{range .Mounts}}}}{{{{if eq .Destination "/config"}}}}{{{{.Source}}}}{{{{end}}}}{{{{end}}}}')
      network=$(docker inspect "$cname" --format '{{{{range $k,$v := .NetworkSettings.Networks}}}}{{{{$k}}}}{{{{end}}}}')
      echo "  profile=$profile_path  network=$network"

      docker rm -f "$cname"
      docker run -d --name "$cname" \\
        --network "$network" \\
        --restart unless-stopped \\
        -v "$profile_path:/config" \\
        grokflow/chrome-vnc:latest

      sleep 3
      docker exec "$cname" pgrep -af chrom 2>&1 | head -2 || echo "  (chromium starting)"
    done

    echo "=== final ps ==="
    docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}' | grep -E '(vnc|frontend)'
""")

sftp = c.open_sftp()
with sftp.open("/tmp/rebuild-vnc.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/rebuild-vnc.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/rebuild-vnc.sh",
    timeout=900,
)
stdout.channel.settimeout(900.0)
data = b""
while True:
    chunk = stdout.channel.recv(65536)
    if not chunk:
        break
    data += chunk
print(data.decode("utf-8", errors="replace"))
c.close()
