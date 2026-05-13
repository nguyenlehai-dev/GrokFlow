"""VNC diagnosis — why the in-page browser shows black."""
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
    echo "=== chromium stderr inside VNC ==="
    FIRST_VNC=$(docker ps --filter name=grokflow-vnc --format '{{.Names}}' | head -1)
    if [ -n "$FIRST_VNC" ]; then
      docker exec $FIRST_VNC sh -lc '
        for f in /var/log/supervisor/chromium*.log /var/log/chromium*.log /home/headless/.cache/chromium/log; do
          [ -f "$f" ] && echo "=== $f ===" && tail -30 "$f"
        done
        echo
        echo "[profile dir ownership]"
        ls -la /home/headless/.config 2>&1 | head -10
        echo
        echo "[lock files in user-data-dir]"
        find /home/headless/.config /tmp -name "Singleton*" 2>/dev/null | head -5
        echo
        echo "[manual chromium launch — capture exit code]"
        su -s /bin/sh -c "DISPLAY=:1 chromium --no-sandbox --headless=new --disable-gpu --version 2>&1 | head -3" headless || true
      '
    fi

    echo
    echo "=== running VNC containers ==="
    docker ps --filter name=grokflow-vnc --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}'

    echo
    echo "=== if any VNC is up — what's inside ==="
    FIRST_VNC=$(docker ps --filter name=grokflow-vnc --format '{{.Names}}' | head -1)
    if [ -n "$FIRST_VNC" ]; then
      echo "--- inspecting $FIRST_VNC ---"
      docker exec $FIRST_VNC sh -lc '
        echo "[ps inside container]"
        ps -ef 2>/dev/null | head -10 || true
        echo
        echo "[supervisor / startup scripts]"
        ls -la /entrypoint.sh /startup.sh /init.sh 2>/dev/null | head -5
        echo
        echo "[display test]"
        echo "DISPLAY=$DISPLAY"
        which xset && xset q 2>&1 | head -5 || echo "(no xset)"
        echo
        echo "[is chromium running?]"
        pgrep -f -l chrom 2>/dev/null | head -3 || echo "(no chromium)"
      ' || true
      echo
      echo "--- last 25 log lines of $FIRST_VNC ---"
      docker logs --tail 25 $FIRST_VNC 2>&1
    else
      echo "(no VNC containers running — were they spawned?)"
    fi

    echo
    echo "=== nginx /vnc/ route config in frontend image ==="
    docker exec grokflow-frontend-1 grep -A 12 'location ~ "\\^/vnc/' /etc/nginx/conf.d/default.conf 2>&1 | head -20

    echo
    echo "=== backend env: PROFILE_BASE_PATH + Docker socket ==="
    docker exec grokflow-backend-1 sh -lc '
      echo "PROFILE_BASE_PATH=$PROFILE_BASE_PATH"
      echo "PROFILE_BASE_PATH_HOST=$PROFILE_BASE_PATH_HOST"
      ls -la /var/run/docker.sock 2>&1 || echo "(no docker.sock!)"
    '

    echo
    echo "=== last 10 backend log lines mentioning vnc ==="
    docker logs --tail 200 grokflow-backend-1 2>&1 | grep -i -E '(vnc|profile|browser)' | tail -10 || echo "(no recent vnc logs)"
""")

sftp = c.open_sftp()
with sftp.open("/tmp/check-vnc.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/check-vnc.sh", 0o755)
sftp.close()

_, stdout, _ = c.exec_command(
    f"echo {PASSWORD} | sudo -S bash /tmp/check-vnc.sh",
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
