"""Unstick Chromium inside all VNC containers.

After a backend container restart (or any other event that hard-kills the
running Chromium), the SingletonCookie / SingletonLock / SingletonSocket
files in the user-data-dir are left behind. The next Chromium spawn sees
them and exits 21 ("another instance is running"). Supervisord retries 3×
then sets FATAL — leaving the VNC iframe black.

This script:
  1) Lists every grokflow-vnc-* container
  2) Removes the Singleton* files
  3) Restarts the chromium program via supervisorctl

Run this when the VNC view goes black after a backend restart. The proper
fix is in vnc/entrypoint.sh — added in a follow-up commit so future
restarts auto-recover.
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

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

script = textwrap.dedent("""\
    #!/usr/bin/env bash
    set -e
    VNCs=$(docker ps --filter name=grokflow-vnc --format '{{.Names}}')
    if [ -z "$VNCs" ]; then
      echo "no VNC containers running"
      exit 0
    fi

    for c in $VNCs; do
      echo "=== $c ==="

      echo "[cleaning Singleton lock files BEFORE restart]"
      # /tmp gets wiped on container restart anyway, but the user-data-dir
      # on the bind-mounted volume persists — so clean SingletonLock there
      # too. (Discovered through prod: a hard-killed Chromium leaves these
      # behind and the next spawn exits 21 within 100 ms.)
      docker exec "$c" sh -lc '
        find /tmp /home /app /data -maxdepth 6 -name "Singleton*" 2>/dev/null -print -delete
      ' 2>&1 | head -10

      echo "[docker restart \\u2014 supervisord respawns chromium clean]"
      docker restart "$c" >/dev/null

      echo "[wait 6s for chromium to boot]"
      sleep 6

      echo "[after] processes inside:"
      docker exec "$c" pgrep -af chrom 2>/dev/null | head -3 || echo "  (chromium not started yet)"
      echo
    done
""")

sftp = c.open_sftp()
with sftp.open("/tmp/fix-vnc.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/fix-vnc.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/fix-vnc.sh",
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
