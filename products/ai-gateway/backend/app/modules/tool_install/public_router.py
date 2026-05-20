"""Public endpoints for desktop-client bootstrap.

No auth — the desktop client doesn't have a JWT before it logs in. The
`tool_id` is the credential: a UUID generated on first install and
persisted to %APPDATA%/GrokFlow/tool_id (Windows) or ~/Library/...
(macOS). Admin gates by setting status=active; until then the desktop
sees status='pending' and renders an approval-waiting screen.
"""
from __future__ import annotations

from fastapi import APIRouter, Header, Request, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.exceptions import NotFound
from app.models import ToolInstall, User

from .schemas import HeartbeatIn, InstallConfigOut, RegisterIn


router = APIRouter(prefix="/api/tool-installs", tags=["tool-install"])


def _client_ip(req: Request) -> str | None:
    """Prefer Cloudflare's CF-Connecting-IP since the SaaS sits behind CF.
    Falls back to X-Forwarded-For (first hop), then the direct socket IP.
    """
    cf = req.headers.get("CF-Connecting-IP")
    if cf:
        return cf
    xff = req.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return req.client.host if req.client else None


async def _build_config(db, install: ToolInstall) -> InstallConfigOut:
    assigned_email: str | None = None
    if install.assigned_user_id:
        u = await db.get(User, install.assigned_user_id)
        if u:
            assigned_email = u.email
    return InstallConfigOut(
        tool_id=install.tool_id,
        status=install.status,
        label=install.label,
        brand_name=install.brand_name,
        allow_all_pages=install.allow_all_pages,
        allowed_pages=list(install.allowed_pages or []),
        allow_landing=install.allow_landing,
        allow_login=install.allow_login,
        allow_register=install.allow_register,
        login_template=install.login_template,
        assigned_user_email=assigned_email,
    )


@router.post("/register", response_model=InstallConfigOut)
async def register(
    payload: RegisterIn, req: Request, db: DbSession,
) -> InstallConfigOut:
    """Upsert on tool_id. New rows land as status=pending — admin must
    flip to active before the install becomes usable."""
    install = (await db.execute(
        select(ToolInstall).where(ToolInstall.tool_id == payload.tool_id)
    )).scalar_one_or_none()

    ip = _client_ip(req)
    if install is None:
        install = ToolInstall(
            tool_id=payload.tool_id,
            machine_name=payload.machine_name,
            public_ip=ip,
            client_version=payload.client_version,
            status="pending",
            allow_all_pages=False,
            allowed_pages=[],
            # Kiosk first-launch lands on minimal admin-console login —
            # no public landing/register chrome. Admin can flip later.
            login_template="admin",
            allow_landing=False,
            allow_register=False,
            allow_login=True,
        )
        db.add(install)
    else:
        # Update transient fields each boot — these can change (laptop
        # joins a new network, app updates, etc.).
        if payload.machine_name:
            install.machine_name = payload.machine_name
        if payload.client_version:
            install.client_version = payload.client_version
        if ip:
            install.public_ip = ip
        from sqlalchemy import func as sf
        install.last_seen_at = sf.now()

    await db.commit()
    await db.refresh(install)
    return await _build_config(db, install)


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def heartbeat(
    payload: HeartbeatIn, req: Request, db: DbSession,
) -> None:
    """Bump last_seen_at. Returns 204 so the desktop client can fire-
    and-forget without parsing a body. Silently no-ops if tool_id is
    unknown (avoids leaking which IDs exist via a 404)."""
    install = (await db.execute(
        select(ToolInstall).where(ToolInstall.tool_id == payload.tool_id)
    )).scalar_one_or_none()
    if not install:
        return
    from sqlalchemy import func as sf
    install.last_seen_at = sf.now()
    if payload.client_version:
        install.client_version = payload.client_version
    ip = _client_ip(req)
    if ip:
        install.public_ip = ip
    await db.commit()


@router.get("/me", response_model=InstallConfigOut)
async def get_me(
    db: DbSession,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> InstallConfigOut:
    """Desktop polls this every few minutes to pick up admin changes
    (status flip pending → active, new allowed_pages). The tool_id is
    sent in a header rather than a path param so the same header can be
    used by an auth middleware to scope downstream requests."""
    if not x_tool_install_id:
        raise NotFound("tool_install")
    install = (await db.execute(
        select(ToolInstall).where(ToolInstall.tool_id == x_tool_install_id)
    )).scalar_one_or_none()
    if not install:
        raise NotFound("tool_install")
    return await _build_config(db, install)
