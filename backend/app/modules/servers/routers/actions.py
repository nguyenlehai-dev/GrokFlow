"""/api/admin/servers/{id}/actions/{verb} — power-control endpoints.

The mapping of verb → shell command lives in `ACTION_COMMANDS`. Each
command is a `sudo` call to systemctl / reboot / shutdown — the target
server's SSH user needs to be in sudoers (or have NOPASSWD set for these
specific commands).
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status as http_status
from sqlalchemy import select  # noqa: F401  — kept for future filters

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Server, ServerRebootHistory
from app.modules.admin.audit import service as audit
from app.modules.servers.schemas import (
    ServerAction,
    ServerActionResponse,
)
from app.modules.servers.services.ssh import SshConnectError, run_sudo

router = APIRouter()


# Verb → (shell command run on the remote host, resulting cached status)
ACTION_COMMANDS: dict[ServerAction, tuple[str, str]] = {
    # `systemctl start multi-user.target` is a no-op when the system is
    # already up, but covers the (rare) case of a hung target. For a fully
    # off host this endpoint can't help — the host first needs WoL / IPMI.
    "start":      ("systemctl start multi-user.target", "active"),
    "reboot":     ("shutdown -r +0", "active"),
    "stop":       ("systemctl isolate rescue.target", "stopped"),
    "shutdown":   ("shutdown -h +0", "stopped"),
    "reinstall":  ("echo 'reinstall is not wired'; exit 1", "unknown"),
}


@router.post(
    "/servers/{server_id}/actions/{verb}",
    response_model=ServerActionResponse,
    status_code=http_status.HTTP_200_OK,
)
async def run_action(
    server_id: uuid.UUID,
    verb: ServerAction,
    admin: SuperAdminUser,
    db: DbSession,
) -> ServerActionResponse:
    s = await db.get(Server, server_id)
    if not s:
        raise NotFound("server")
    if verb not in ACTION_COMMANDS:
        raise InvalidPayload(f"Unsupported action: {verb}")

    cmd, new_status = ACTION_COMMANDS[verb]

    # `reinstall` is deliberately stubbed — wiring it requires either a
    # PXE / cloud-init re-image hook or vendor API integration. Keeping
    # the route alive so the FE button works but returning a clear 400.
    if verb == "reinstall":
        raise InvalidPayload("Reinstall chưa được tích hợp — cần PXE/IPMI hook.")

    # Reboot gets a history row regardless of how the SSH call resolves
    # — so the audit trail captures the attempt + outcome together.
    reboot_row: ServerRebootHistory | None = None
    if verb == "reboot":
        reboot_row = ServerRebootHistory(
            server_id=s.id, trigger="manual", triggered_by=admin.id,
            status="running",
        )
        db.add(reboot_row)
        await db.flush()

    try:
        res = run_sudo(s, cmd, timeout=15.0)
    except SshConnectError as e:
        s.status = "unreachable"
        if reboot_row is not None:
            reboot_row.status = "failed"
            reboot_row.error_message = str(e)
            reboot_row.finished_at = datetime.now(timezone.utc)
        await db.commit()
        return ServerActionResponse(ok=False, message=str(e), status="unreachable")

    # `shutdown -r` returns immediately even before the host reboots —
    # treat rc==0 OR rc==255 (SSH channel killed by reboot) as success.
    ok = res.rc in (0, 255)
    s.status = new_status if ok else s.status
    if reboot_row is not None:
        reboot_row.status = "success" if ok else "failed"
        reboot_row.error_message = None if ok else (res.stderr or "")[:500]
        reboot_row.finished_at = datetime.now(timezone.utc)
    await audit.log_action(
        db, user_id=admin.id, action=f"server_{verb}",
        target_type="server", target_id=s.id,
        metadata={"rc": res.rc, "stderr": res.stderr[:200]},
    )
    await db.commit()
    return ServerActionResponse(
        ok=ok,
        message=(res.stderr or res.stdout or f"Đã {verb}").strip()[:200],
        status=s.status,  # type: ignore[arg-type]
    )
