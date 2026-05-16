"""SSH helpers — paramiko wrapped to match this module's needs.

`SshSession` is a context manager so callers don't leak connections on
exceptions. `run_command` opens-runs-closes for callers who only need
one shot.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import paramiko

from app.core.encryption import decrypt
from app.models import Server

log = logging.getLogger(__name__)


@dataclass
class SshResult:
    rc: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.rc == 0


class SshConnectError(RuntimeError):
    """Raised when we can't open an SSH channel — host unreachable, bad
    creds, key file missing, etc."""


def _resolve_password(server: Server) -> Optional[str]:
    """Decrypt the stored password (if any). Empty string treated as None."""
    if not server.ssh_password_encrypted:
        return None
    try:
        plain = decrypt(server.ssh_password_encrypted)
    except Exception as e:  # noqa: BLE001 — surface as connect failure
        raise SshConnectError(f"Cannot decrypt SSH password: {e}") from e
    return plain or None


def open_client(server: Server, timeout: float = 8.0) -> paramiko.SSHClient:
    """Open a connected SSHClient. Caller is responsible for closing."""
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(
            hostname=server.hostname,
            port=server.ssh_port,
            username=server.ssh_user,
            password=_resolve_password(server),
            key_filename=server.ssh_key_path,
            look_for_keys=server.ssh_key_path is not None,
            allow_agent=False,
            timeout=timeout,
            banner_timeout=timeout,
        )
    except paramiko.AuthenticationException as e:
        raise SshConnectError(f"SSH auth failed: {e}") from e
    except (TimeoutError, OSError) as e:
        raise SshConnectError(f"SSH connect failed: {e}") from e
    return cli


def run_command(server: Server, command: str, timeout: float = 30.0) -> SshResult:
    """One-shot run. Returns rc + captured stdout/stderr."""
    cli = open_client(server)
    try:
        _, stdout, stderr = cli.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        return SshResult(rc=rc, stdout=out, stderr=err)
    finally:
        cli.close()


def run_sudo(server: Server, command: str, timeout: float = 30.0) -> SshResult:
    """Run a command via `sudo -S` using the stored SSH password.

    Falls back to plain sudo when no password is stored (key-auth setup
    must then grant NOPASSWD for the user — common on managed VPS).
    """
    pw = _resolve_password(server)
    if pw:
        # `sudo -S` reads password from stdin; pipe in. Use `bash -c` so the
        # quoting is single-layer (we only escape double quotes in the inner cmd).
        escaped = command.replace('"', r'\"')
        wrapped = f"echo {pw!r} | sudo -S -p '' bash -c \"{escaped}\""
    else:
        wrapped = f"sudo -n bash -c \"{command}\""
    return run_command(server, wrapped, timeout=timeout)
