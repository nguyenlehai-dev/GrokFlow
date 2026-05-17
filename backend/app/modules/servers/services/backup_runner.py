"""SSH-driven daily backup executor.

Run by both the cron scheduler (`app.workers.server_monitor`) and the
manual "Backup now" endpoint. Each call does:

  1. mkdir -p <target_path>
  2. tar -czf <target>/<label>-<ts>.tar.gz <backup_paths...>   (skipped if list empty)
  3. pg_dump -U postgres <db_name> | gzip > <target>/<label>-<ts>.sql.gz   (skipped if NULL)
  4. find <target> -mtime +<retain_days> -delete    (prune old)
  5. return (success, output_path, size_bytes, message)

Everything goes through `run_sudo` so the SSH user needs NOPASSWD for
tar / pg_dump / find. The function is intentionally synchronous —
callers wrap it in `asyncio.to_thread`.

`output_path` is the .tar.gz when filesystem paths were provided, else
the .sql.gz from pg_dump. Both are uploaded to /opt/backups by default;
admin can change `backup_target_path` per-server.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.models import Server
from app.modules.servers.services.ssh import SshConnectError, run_sudo


log = logging.getLogger(__name__)


@dataclass(slots=True)
class BackupResult:
    success: bool
    output_path: str | None
    size_bytes: int | None
    message: str
    # When the backup ran multiple steps (tar + pg_dump), the
    # `output_path` is the tar; we still include the sql in the message.


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _shell_quote(s: str) -> str:
    """Lazy single-quote escape for embedding paths in shell commands."""
    return "'" + s.replace("'", "'\\''") + "'"


def run_backup(server: Server) -> BackupResult:
    """Execute one backup pass against `server` over SSH.

    Steps run sequentially with explicit checks — if step 2 (tar) fails
    we still try step 3 (pg_dump). Both succeeding gives one tar + one
    sql in the target dir; either alone is acceptable. Only when both
    are configured AND both fail do we return success=False."""
    target = server.backup_target_path or "/opt/backups"
    stamp = _stamp()
    label = (server.label or "server").replace(" ", "_").lower()
    tar_path = f"{target}/{label}-{stamp}.tar.gz"
    sql_path = f"{target}/{label}-{stamp}.sql.gz"

    paths = [p for p in (server.backup_paths or []) if p]
    db_name = server.backup_db_name
    retain = max(1, int(server.backup_retain_days or 7))

    if not paths and not db_name:
        return BackupResult(
            success=False, output_path=None, size_bytes=None,
            message="No backup_paths and no backup_db_name configured.",
        )

    # 1. mkdir -p target (sudo, since /opt/backups is often root-owned)
    try:
        mkdir = run_sudo(server, f"mkdir -p {_shell_quote(target)}", timeout=10.0)
        if mkdir.rc != 0:
            return BackupResult(
                success=False, output_path=None, size_bytes=None,
                message=f"mkdir failed: {mkdir.stderr[:300]}",
            )
    except SshConnectError as e:
        return BackupResult(False, None, None, f"SSH unreachable: {e}")

    tar_ok = sql_ok = False
    messages: list[str] = []
    primary_output: str | None = None
    primary_size: int | None = None

    # 2. tar filesystem paths
    if paths:
        joined = " ".join(_shell_quote(p) for p in paths)
        # `--ignore-failed-read` so a missing dir within the list doesn't
        # nuke the whole archive — we still get the others.
        cmd = (
            f"tar --ignore-failed-read -czf {_shell_quote(tar_path)} {joined} "
            f"&& stat -c %s {_shell_quote(tar_path)}"
        )
        try:
            res = run_sudo(server, cmd, timeout=900.0)
            if res.rc == 0:
                tar_ok = True
                primary_output = tar_path
                try:
                    primary_size = int(res.stdout.strip().splitlines()[-1])
                except (ValueError, IndexError):
                    primary_size = None
                messages.append(f"tar OK → {tar_path}")
            else:
                messages.append(f"tar failed rc={res.rc}: {res.stderr[:200]}")
        except SshConnectError as e:
            messages.append(f"tar SSH error: {e}")

    # 3. pg_dump
    if db_name:
        # Quote db name minimally — it can only contain identifier chars,
        # but be defensive anyway.
        cmd = (
            f"sudo -u postgres pg_dump {_shell_quote(db_name)} | gzip "
            f"> {_shell_quote(sql_path)} && stat -c %s {_shell_quote(sql_path)}"
        )
        try:
            # Wrap the pipeline in `bash -c` so the redirect happens
            # remote-side. run_sudo already prefixes sudo, so we just
            # need bash here.
            res = run_sudo(server, f"bash -c {_shell_quote(cmd)}", timeout=600.0)
            if res.rc == 0:
                sql_ok = True
                if primary_output is None:
                    primary_output = sql_path
                    try:
                        primary_size = int(res.stdout.strip().splitlines()[-1])
                    except (ValueError, IndexError):
                        primary_size = None
                messages.append(f"pg_dump OK → {sql_path}")
            else:
                messages.append(f"pg_dump failed rc={res.rc}: {res.stderr[:200]}")
        except SshConnectError as e:
            messages.append(f"pg_dump SSH error: {e}")

    # 4. Prune old backups (best-effort — don't fail the run on this)
    try:
        prune = run_sudo(
            server,
            f"find {_shell_quote(target)} -maxdepth 1 -name {_shell_quote(label + '-*')}"
            f" -mtime +{retain} -delete",
            timeout=30.0,
        )
        if prune.rc != 0:
            log.warning("prune rc=%s stderr=%s", prune.rc, prune.stderr[:200])
        else:
            messages.append(f"pruned >{retain}d")
    except SshConnectError:
        pass  # Probe will detect unreachability separately.

    overall_ok = tar_ok or sql_ok
    return BackupResult(
        success=overall_ok,
        output_path=primary_output,
        size_bytes=primary_size,
        message=" | ".join(messages)[:1000],
    )


__all__ = ["run_backup", "BackupResult"]
