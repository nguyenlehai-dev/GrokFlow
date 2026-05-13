"""Diagnose a running deploy — find which build step is in flight."""
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
    echo "=== docker build top-level proc ==="
    pgrep -af 'docker compose.*build' | head -3

    echo
    echo "=== buildkit / buildx child processes ==="
    ps -ef | grep -E '(buildkit|buildx|apt-get|pip|playwright|node)' | grep -v grep | head -10

    echo
    echo "=== open files for the build process (top 10 by recency) ==="
    BUILD_PID=$(pgrep -f 'docker compose.*build' | head -1)
    if [ -n "$BUILD_PID" ]; then
      ls -lat /proc/$BUILD_PID/fd 2>/dev/null | head -15
    else
      echo "(no docker compose build pid)"
    fi

    echo
    echo "=== buildkitd child / latest build container ==="
    # The actual build runs inside a buildkitd-spawned container
    docker ps -a --filter status=running --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}' | grep -E '(build|moby)' || echo "(none — old buildkit)"

    echo
    echo "=== last log lines of docker daemon ==="
    journalctl -u docker --no-pager -n 5 2>&1 | tail -5 || true

    echo
    echo "=== disk + memory ==="
    df -h /var/lib/docker 2>&1 | tail -2
    free -h | head -2

    echo
    echo "=== network throughput last 10s on eth0 ==="
    IFACE=$(ip -o -4 route show to default | awk '{print $5}' | head -1)
    if [ -n "$IFACE" ]; then
      R1=$(cat /sys/class/net/$IFACE/statistics/rx_bytes)
      sleep 5
      R2=$(cat /sys/class/net/$IFACE/statistics/rx_bytes)
      RATE=$(( (R2-R1) / 5 / 1024 ))
      echo "$IFACE rx ≈ ${RATE} KB/s"
    fi
""")

sftp = c.open_sftp()
with sftp.open("/tmp/check-deploy.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/check-deploy.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/check-deploy.sh",
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
