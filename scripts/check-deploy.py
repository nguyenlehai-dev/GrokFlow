"""Diagnose why VNC rebuild silently failed."""
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
    echo "=== git state on VPS ==="
    git log --oneline -3
    git status -sb | head -3

    echo
    echo "=== vnc/Dockerfile in VPS — does it have the split autocutsel? ==="
    grep -A 4 "autocutsel" vnc/Dockerfile 2>&1 | head -10

    echo
    echo "=== frontend/nginx.conf in VPS — clipboardSync flag? ==="
    grep "clipboardSync" frontend/nginx.conf 2>&1 | head -3

    echo
    echo "=== /tmp/rebuild-vnc.sh exists? what did it contain? ==="
    ls -la /tmp/rebuild-vnc.sh 2>&1
    [ -f /tmp/rebuild-vnc.sh ] && head -8 /tmp/rebuild-vnc.sh
""")

sftp = c.open_sftp()
with sftp.open("/tmp/diag.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/diag.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/diag.sh",
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
