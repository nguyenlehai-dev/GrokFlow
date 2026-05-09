"""Push selected files to the VPS using paramiko (password auth) + run migrations.

Usage:
    python deploy/push_via_paramiko.py
        --host 192.168.1.15 --user vpsroot --password '...'
        --remote-dir /opt/grokflow

By default ships only the files we just changed. Pass --full to rsync everything.
"""

from __future__ import annotations

import argparse
import posixpath
import sys
import time
from pathlib import Path

import paramiko

DEFAULT_FILES = [
    "backend/app/providers/grok_provider.py",
    "backend/app/workers/run.py",
    "backend/app/workers/idle_cleanup.py",
    "backend/app/browser/vnc_manager.py",
    "backend/app/models/__init__.py",
    "backend/app/modules/jobs/schemas.py",
    "backend/app/modules/jobs/router.py",
    "backend/app/modules/jobs/service.py",
    "backend/app/modules/files/service.py",
    "backend/alembic/versions/0004_job_next_attempt.py",
    "frontend/src/core/api/axios.ts",
    "frontend/src/modules/jobs/JobDetailDrawer.tsx",
    "frontend/src/modules/jobs/CreateJobModal.tsx",
    "frontend/src/modules/jobs/EditJobModal.tsx",
    "frontend/src/modules/jobs/JobsPage.tsx",
    "frontend/src/modules/dashboard/DashboardPage.tsx",
    "frontend/src/modules/api-docs/ApiDocsPage.tsx",
    "docker-compose.intranet.yml",
]


def _safe_print(s: str, file=sys.stdout) -> None:
    enc = getattr(file, "encoding", None) or "utf-8"
    try:
        print(s, file=file)
    except UnicodeEncodeError:
        print(s.encode(enc, errors="replace").decode(enc, errors="replace"), file=file)


def run(client: paramiko.SSHClient, cmd: str, *, check: bool = True) -> str:
    _safe_print(f"$ {cmd}")
    sys.stdout.flush()
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=900)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        _safe_print(out)
    if err.strip():
        _safe_print(err, file=sys.stderr)
    if check and rc != 0:
        raise RuntimeError(f"Remote command failed (rc={rc}): {cmd}")
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True)
    p.add_argument("--user", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--port", type=int, default=22)
    p.add_argument("--remote-dir", default="/opt/grokflow")
    p.add_argument("--compose-file", default="docker-compose.intranet.yml")
    p.add_argument("--skip-migrate", action="store_true")
    p.add_argument("--skip-restart", action="store_true")
    args = p.parse_args()

    repo = Path(__file__).resolve().parent.parent
    files = [repo / f for f in DEFAULT_FILES]
    for f in files:
        if not f.exists():
            print(f"missing: {f}", file=sys.stderr)
            return 2

    print(f"==> Connecting to {args.user}@{args.host}:{args.port}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=args.host, port=args.port, username=args.user,
        password=args.password, look_for_keys=False, allow_agent=False, timeout=15,
    )

    sftp = client.open_sftp()
    print("==> Uploading patched files")
    for f in files:
        rel = f.relative_to(repo).as_posix()
        remote = posixpath.join(args.remote_dir, rel)
        run(client, f"mkdir -p '{posixpath.dirname(remote)}'")
        sftp.put(str(f), remote)
        print(f"  {rel}  ->  {remote}")
    sftp.close()

    base = (f"cd {args.remote_dir} && docker compose --env-file .env.prod "
            f"-f {args.compose_file}")

    if not args.skip_restart:
        # Order matters: backend image bakes the source (incl. migration files),
        # so we MUST rebuild the image before running alembic upgrade — otherwise
        # the migration file is invisible to the running container.
        print("==> Rebuilding backend / worker / idle-cleanup (with new code)")
        run(client, f"{base} up -d --build backend worker idle-cleanup")

    if not args.skip_migrate:
        # Wait for backend to come up (post-rebuild restart)
        print("==> Waiting for backend container to be ready")
        for _ in range(30):
            out = run(client, f"{base} ps --status running --services", check=False)
            if "backend" in out:
                break
            time.sleep(1)
        print("==> Running alembic upgrade head")
        run(client, f"{base} exec -T backend alembic upgrade head")
        # Worker may have crashed against missing column before migration; restart it.
        print("==> Restarting worker after migration")
        run(client, f"{base} restart worker idle-cleanup")

    if not args.skip_restart and any(
        str(f).endswith(".tsx") or str(f).endswith(".ts") for f in files
    ):
        print("==> Rebuilding frontend")
        run(client, f"{base} up -d --build frontend")

    print("==> Final status")
    run(client, f"{base} ps")

    client.close()
    print(f"\nDeploy complete in {time.strftime('%H:%M:%S')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
