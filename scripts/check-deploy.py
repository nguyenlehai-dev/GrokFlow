"""Inspect rebuild state — what's actually deployed."""
from __future__ import annotations

import os
import sys
import textwrap

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

script = textwrap.dedent("""\
    #!/usr/bin/env bash
    cd /home/vpsroot/grokflow
    echo "=== git HEAD ==="
    git log --oneline -2

    echo
    echo "=== chrome-vnc image age + ID ==="
    docker images grokflow/chrome-vnc --format '{{.Repository}}:{{.Tag}}\\t{{.CreatedSince}}\\t{{.Size}}\\t{{.ID}}' | head -3

    echo
    echo "=== frontend image age ==="
    docker images grokflow/frontend --format '{{.Repository}}:{{.Tag}}\\t{{.CreatedSince}}\\t{{.Size}}' | head -3

    echo
    echo "=== running containers ==="
    docker ps --filter name=grokflow --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}' | head -10

    echo
    echo "=== nginx vnc redirect line in running frontend ==="
    docker exec grokflow-frontend-1 grep "vnc.html" /etc/nginx/conf.d/default.conf 2>&1 | head -3

    echo
    echo "=== still building? any in-flight docker build ==="
    pgrep -af 'docker.* build' | head -5 || echo "(no active build)"
""")

sftp = c.open_sftp()
with sftp.open("/tmp/inspect.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/inspect.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/inspect.sh",
    timeout=60,
)
stdout.channel.settimeout(60.0)
data = b""
while True:
    chunk = stdout.channel.recv(65536)
    if not chunk:
        break
    data += chunk
print(data.decode("utf-8", errors="replace"))
c.close()
