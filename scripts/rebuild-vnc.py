"""Rebuild chrome-vnc + frontend with the new clipboard-sync changes.

Run via nohup on the VPS so the build survives SSH channel timeouts —
the previous attempts had paramiko close the channel mid-build, which
killed the foreground BuildKit process and left the old image in place.
"""
from __future__ import annotations

import os
import sys
import textwrap
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")
ROOT = os.getenv("VPS_PROJECT_PATH", "/home/vpsroot/grokflow")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

# 1) Drop a detached script that does the heavy lifting.
script = textwrap.dedent(f"""\
    #!/usr/bin/env bash
    set -e
    exec >/tmp/rebuild-vnc-detached.log 2>&1
    cd {ROOT}

    echo "[$(date)] === git pull ==="
    git pull --rebase

    echo "[$(date)] === build chrome-vnc ==="
    docker build -t grokflow/chrome-vnc:latest ./vnc

    echo "[$(date)] === build frontend (new nginx.conf with clipboardSync=1) ==="
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      build frontend
    docker compose --env-file .env.prod -f docker-compose.intranet.yml \\
      up -d frontend

    echo "[$(date)] === recreate active VNC containers ==="
    for cname in $(docker ps --filter name=grokflow-vnc --format '{{{{.Names}}}}'); do
      echo "  recreating $cname"
      profile_path=$(docker inspect "$cname" --format '{{{{range .Mounts}}}}{{{{if eq .Destination "/config"}}}}{{{{.Source}}}}{{{{end}}}}{{{{end}}}}')
      network=$(docker inspect "$cname" --format '{{{{range $k,$v := .NetworkSettings.Networks}}}}{{{{$k}}}}{{{{end}}}}')
      docker rm -f "$cname"
      docker run -d --name "$cname" \\
        --network "$network" \\
        --restart unless-stopped \\
        -v "$profile_path:/config" \\
        grokflow/chrome-vnc:latest
    done

    echo "[$(date)] === done ==="
    docker images grokflow/chrome-vnc --format '{{{{.CreatedSince}}}}\\t{{{{.Size}}}}'
""")

sftp = c.open_sftp()
with sftp.open("/tmp/rebuild-vnc-detached.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/rebuild-vnc-detached.sh", 0o755)
sftp.close()

# 2) Launch it under nohup so it survives the SSH session ending.
launch = f"echo {PASSWORD} | sudo -S nohup setsid bash /tmp/rebuild-vnc-detached.sh </dev/null >/dev/null 2>&1 &"
_, stdout, _ = c.exec_command(launch, timeout=10)
stdout.read()
print("Launched detached build. Tail /tmp/rebuild-vnc-detached.log to follow.\n")

# 3) Wait + poll log for completion.
for i in range(60):
    time.sleep(15)
    _, stdout, _ = c.exec_command(
        f"echo {PASSWORD} | sudo -S tail -1 /tmp/rebuild-vnc-detached.log 2>/dev/null",
        timeout=15,
    )
    line = stdout.read().decode("utf-8", errors="replace").strip()
    print(f"  poll {i+1:>2}/60: {line[:120]}")
    if "=== done ===" in line or "grokflow/chrome-vnc" in line:
        break
    if "ERROR" in line.upper() or "Error response" in line:
        print("  ERROR detected — stopping poll")
        break

print()
print("=== last 30 lines of log ===")
_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S tail -30 /tmp/rebuild-vnc-detached.log",
    timeout=20,
)
print(stdout.read().decode("utf-8", errors="replace"))

c.close()
