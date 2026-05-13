"""Quick health + state check after a Flow deploy."""
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

    script = textwrap.dedent(f"""\
        #!/usr/bin/env bash
        cd {ROOT}
        echo "=== git HEAD on VPS ==="
        git log --oneline -3
        echo "=== docker ps ==="
        docker ps --filter name=grokflow --format '{{{{.Names}}}}\\t{{{{.Status}}}}\\t{{{{.Image}}}}'
        echo "=== alembic current ==="
        docker exec grokflow-backend-1 alembic current 2>&1 | tail -3 || true
        echo "=== ffmpeg in backend ==="
        docker exec grokflow-backend-1 sh -lc 'which ffmpeg && ffmpeg -version | head -1' 2>&1 || true
        echo "=== flow_jobs table exists? ==="
        docker exec grokflow-postgres-1 psql -U grokflow -d grokflow -tAc \\
          "SELECT to_regclass('public.flow_jobs')" 2>&1 || true
        echo "=== /api/flow/health (auth-required → 401 if module up) ==="
        docker exec grokflow-backend-1 curl -sS -o /dev/null -w 'HTTP %{{http_code}}\\n' http://localhost:8000/api/flow/health || true
    """)

    sftp = c.open_sftp()
    with sftp.open("/tmp/grokflow-verify.sh", "w") as f:
        f.write(script)
    sftp.chmod("/tmp/grokflow-verify.sh", 0o755)
    sftp.close()

    # No pty + generous channel timeout — pty was eating output and the
    # 60s default kept tripping mid-stream during heavy docker exec output.
    _, stdout, stderr = c.exec_command(
        f"echo {PASSWORD} | sudo -S bash /tmp/grokflow-verify.sh",
        timeout=180,
    )
    stdout.channel.settimeout(180.0)
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
