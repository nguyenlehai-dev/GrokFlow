"""POST /api/admin/system/heal — one-click infrastructure recovery.

Super_admin-only. When the host nginx VNC-map watcher (a systemd
`.path` unit) drops to `failed`/`inactive`, nginx silently ignores
any subsequent map writes from the backend. /vnc/<short>/ routes
serve a stale upstream and partners see 502s on every Auto-login
attempt. The cron `grokflow-watcher-keepalive` re-runs every 5 min
to catch this, but admins shouldn't have to wait — this endpoint
forces the same recovery synchronously.

What it does (in order):
  1. Refresh the VNC map file with current container IPs (so the
     map has no stale entries pointing to dead containers)
  2. Run the host-side `grokflow-watcher-keepalive.sh` over SSH —
     that script restarts the path unit if dead and force-reloads
     nginx to apply any drifted map content

Requires host SSH access (HOST_SSH_HOST/PORT/USER/PASSWORD in env,
already configured for the git-admin module). If SSH isn't wired,
the map-refresh step still runs and the response surfaces the
SSH error so the admin can ssh in manually.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import AdminUser
from app.core.exceptions import PermissionDenied
from app.services.nginx_sync import refresh_vnc_map


router = APIRouter()


class SystemHealOut(BaseModel):
    map_refreshed: bool
    map_refresh_error: str | None
    nginx_reloaded: bool
    nginx_reload_error: str | None
    watcher_state: str | None
    message: str


@router.post("/system/heal", response_model=SystemHealOut)
async def system_heal(admin: AdminUser) -> SystemHealOut:
    if admin.role != "super_admin":
        raise PermissionDenied("Super admin only")

    map_refreshed = False
    map_err: str | None = None
    try:
        map_refreshed = bool(refresh_vnc_map())
    except Exception as exc:  # noqa: BLE001
        map_err = f"{type(exc).__name__}: {exc}"

    # SSH into host + run the keepalive script. It's idempotent —
    # silent when healthy, fix+log when not. Returns nothing on
    # success.
    nginx_reloaded = False
    nginx_err: str | None = None
    watcher_state: str | None = None

    try:
        nginx_reloaded, watcher_state, nginx_err = await asyncio.to_thread(
            _ssh_run_keepalive,
        )
    except Exception as exc:  # noqa: BLE001
        nginx_err = f"{type(exc).__name__}: {exc}"

    parts = []
    if map_refreshed:
        parts.append("map refreshed")
    elif map_err:
        parts.append(f"map FAIL: {map_err}")
    if nginx_reloaded:
        parts.append("nginx reloaded")
    if watcher_state:
        parts.append(f"watcher={watcher_state}")
    if nginx_err and not nginx_reloaded:
        parts.append(f"ssh FAIL: {nginx_err}")
    message = "; ".join(parts) or "no-op"

    return SystemHealOut(
        map_refreshed=map_refreshed,
        map_refresh_error=map_err,
        nginx_reloaded=nginx_reloaded,
        nginx_reload_error=nginx_err,
        watcher_state=watcher_state,
        message=message,
    )


def _ssh_run_keepalive() -> tuple[bool, str | None, str | None]:
    """SSH to host, run the keepalive script + capture watcher state.

    Returns (nginx_reloaded, watcher_state, error_message). The
    keepalive script auto-reloads nginx after restarting the watcher,
    so 'nginx_reloaded=True' really means the script took an action
    (either restarted+reloaded or all already healthy).
    """
    host = getattr(settings, "HOST_SSH_HOST", "host.docker.internal")
    port = int(getattr(settings, "HOST_SSH_PORT", 22))
    user = getattr(settings, "HOST_SSH_USER", "vpsroot")
    password = getattr(settings, "HOST_SSH_PASSWORD", "") or ""

    if not password:
        return False, None, "HOST_SSH_PASSWORD not set"

    try:
        import paramiko
    except ImportError:
        return False, None, "paramiko not installed"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=host, port=port, username=user, password=password,
            timeout=10, banner_timeout=10, auth_timeout=10,
        )
        # 1) Capture current watcher state before fix.
        stdin, stdout, stderr = client.exec_command(
            "systemctl is-active grokflow-nginx-reload.path", timeout=5,
        )
        state = stdout.read().decode().strip() or "unknown"

        # 2) Run keepalive (idempotent — only acts when broken).
        keepalive = "/usr/local/bin/grokflow-watcher-keepalive.sh"
        stdin, stdout, stderr = client.exec_command(
            f"echo '{password}' | sudo -S {keepalive} && "
            f"echo '{password}' | sudo -S nginx -s reload",
            timeout=20,
        )
        out = stdout.read().decode()
        err = stderr.read().decode()
        exit_code = stdout.channel.recv_exit_status()

        if exit_code != 0:
            return False, state, (err or out or f"exit={exit_code}")[:300]

        # 3) Re-check state.
        stdin, stdout, stderr = client.exec_command(
            "systemctl is-active grokflow-nginx-reload.path", timeout=5,
        )
        new_state = stdout.read().decode().strip() or state
        return True, new_state, None
    finally:
        client.close()
