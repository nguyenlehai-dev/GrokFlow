"""Profile management.

Ownership model: profiles are admin-owned. Customers do NOT create or modify
profiles — they pick from the admin's pool when creating jobs.

- Admin: full CRUD + upload-cookies + auto-login
- Customer: GET only (sees admin's `logged_in` profiles as a pool)
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Header, UploadFile, File as FastapiFile, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select

from app.browser import profile_manager, vnc_manager
from app.core.config import settings
from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.exceptions import InvalidCredentials, InvalidPayload, NotFound, PermissionDenied
from app.core.security import create_short_token, decode_access_token
from app.core.tenant import scope_by_user_domain
from app.models import Profile, User
from app.modules.audit import service as audit


async def _assert_profile_accessible(
    db, admin: User, profile: Profile,
) -> None:
    """Tenant guard for any single-row Profile op done by an admin.

    super_admin: passes.
    admin: passes only if the profile's owner lives in the same domain.
    Anyone else: caller shouldn't have hit this — endpoints gate with
    AdminUser dep first.
    """
    if admin.role == "super_admin":
        return
    owner = await db.get(User, profile.user_id)
    if not owner or owner.domain_id != admin.domain_id:
        raise PermissionDenied("Profile không thuộc domain bạn quản lý")

from .schemas import (
    OpenBrowserResponse,
    ProfileCreate,
    ProfileOut,
    ProfileUpdate,
)


class HelperTokenOut(BaseModel):
    token: str
    profile_id: uuid.UUID
    server_url: str
    provider: str
    command: str
    expires_in: int


class HelperCookiesIn(BaseModel):
    cookies: list[dict]


class VncSessionOut(BaseModel):
    profile_id: uuid.UUID
    iframe_url: str
    username: str = "vncuser"
    password: str
    expires_in: int


class VncStatusOut(BaseModel):
    running: bool
    profile_id: str | None
    started_at: str | None


router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _profile_dir(user_id: uuid.UUID, profile_id: uuid.UUID) -> Path:
    base = Path(settings.PROFILE_BASE_PATH).resolve()
    return base / str(user_id) / str(profile_id)


@router.get("", response_model=list[ProfileOut])
async def list_profiles(user: CurrentUser, db: DbSession) -> list[Profile]:
    """super_admin sees all profiles; per-domain admin sees only the
    profiles owned by users in their own domain; customers see only
    `logged_in` profiles owned by admins in their domain (the pool).
    """
    base = select(Profile).where(Profile.status != "deleted")

    if user.role == "super_admin":
        q = base.order_by(Profile.created_at.desc())
    elif user.role == "admin":
        # Tenant-scope: only profiles owned by users in the admin's domain.
        q = scope_by_user_domain(base, Profile.user_id, user).order_by(
            Profile.created_at.desc()
        )
    else:
        # Customer pool: admin-owned, logged_in, same domain.
        q = (
            select(Profile)
            .join(User, User.id == Profile.user_id)
            .where(
                User.role.in_(("admin", "super_admin")),
                Profile.status == "logged_in",
                User.domain_id == user.domain_id,
            )
            .order_by(Profile.created_at.desc())
        )
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(payload: ProfileCreate, admin: AdminUser, db: DbSession) -> Profile:
    """Admin only. Customer cannot create profiles — they use the pool."""
    pid = uuid.uuid4()
    path = _profile_dir(admin.id, pid)
    profile_manager.ensure_profile_dir(str(path))
    profile = Profile(
        id=pid,
        user_id=admin.id,
        name=payload.name,
        provider=payload.provider,
        profile_path=str(path),
        status="created",
        max_concurrent_jobs=payload.max_concurrent_jobs,
    )
    db.add(profile)
    await audit.log_action(db, user_id=admin.id, action="create_profile",
                           target_type="profile", target_id=pid,
                           metadata={"name": payload.name, "provider": payload.provider})
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(profile_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Profile:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    # get_profile takes CurrentUser (not AdminUser) since customers also
    # need to read profiles from the pool — inline the check instead of
    # using _assert_profile_accessible which is for admin-only callers.
    owner = await db.get(User, profile.user_id)
    if not owner:
        raise NotFound("profile")
    if user.role == "super_admin":
        return profile
    if user.role == "admin":
        if owner.domain_id != user.domain_id:
            raise PermissionDenied("Profile không thuộc domain bạn quản lý")
        return profile
    # Customer can only see admin-owned, logged_in profiles in their own domain.
    if (
        owner.role not in ("admin", "super_admin")
        or profile.status != "logged_in"
        or owner.domain_id != user.domain_id
    ):
        raise PermissionDenied()
    return profile


@router.patch("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: uuid.UUID, payload: ProfileUpdate, admin: AdminUser, db: DbSession,
) -> Profile:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    changes: dict = {}
    if payload.name is not None:
        profile.name = payload.name; changes["name"] = payload.name
    if payload.status is not None:
        profile.status = payload.status; changes["status"] = payload.status
    if payload.max_concurrent_jobs is not None:
        profile.max_concurrent_jobs = payload.max_concurrent_jobs
        changes["max_concurrent_jobs"] = payload.max_concurrent_jobs
    # Audit so changes to status (esp. "deleted" / "logged_in") are traceable.
    await audit.log_action(
        db, user_id=admin.id, action="update_profile",
        target_type="profile", target_id=profile.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    profile_manager.remove_profile_dir(profile.profile_path)
    await audit.log_action(db, user_id=admin.id, action="delete_profile",
                           target_type="profile", target_id=profile.id,
                           metadata={"name": profile.name})
    await db.delete(profile)
    await db.commit()


@router.post("/{profile_id}/upload-cookies", response_model=ProfileOut)
async def upload_cookies(
    profile_id: uuid.UUID,
    admin: AdminUser,
    db: DbSession,
    file: UploadFile = FastapiFile(...),
) -> Profile:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    if profile.status == "running_job":
        raise InvalidPayload("Profile is busy running a job")

    raw = await file.read()
    if len(raw) > 1_000_000:
        raise InvalidPayload("Cookies file too large (>1MB)")
    try:
        cookies = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise InvalidPayload(f"Invalid JSON: {e}")
    if not isinstance(cookies, list):
        raise InvalidPayload("Cookies file must be a JSON array")

    try:
        count = await profile_manager.import_cookies(profile.profile_path, cookies)
    except Exception as e:  # noqa: BLE001
        raise InvalidPayload(f"Failed to import cookies: {e}")

    profile.status = "logged_in"
    profile.last_login_check_at = datetime.now(timezone.utc)
    profile.error_message = None
    await audit.log_action(db, user_id=admin.id, action="upload_cookies",
                           target_type="profile", target_id=profile.id,
                           metadata={"count": count})
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/{profile_id}/open-browser", response_model=OpenBrowserResponse)
async def open_browser(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> OpenBrowserResponse:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    profile.status = "opening"
    await db.commit()
    return OpenBrowserResponse(
        profile_id=profile.id, status=profile.status,
        message="Use POST /api/profiles/{id}/helper-token to get the helper command.",
    )


@router.post("/{profile_id}/helper-token", response_model=HelperTokenOut)
async def issue_helper_token(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> HelperTokenOut:
    """Issue a 30-minute scoped JWT for grokflow-helper. Admin only."""
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    minutes = 30
    token = create_short_token(
        subject=str(admin.id),
        extra={"scope": "helper", "profile_id": str(profile.id)},
        minutes=minutes,
    )
    base = settings.cors_origin_list[0] if settings.cors_origin_list else "https://your-server"
    cmd = (
        f"python grokflow-helper.py "
        f"--server {base} "
        f"--profile {profile.id} "
        f"--provider {profile.provider} "
        f"--token {token}"
    )
    return HelperTokenOut(
        token=token, profile_id=profile.id, server_url=base, provider=profile.provider,
        command=cmd, expires_in=minutes * 60,
    )


@router.post("/{profile_id}/upload-cookies-helper", response_model=ProfileOut)
async def upload_cookies_via_helper(
    profile_id: uuid.UUID,
    payload: HelperCookiesIn,
    db: DbSession,
    authorization: str | None = Header(default=None),
) -> Profile:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise InvalidCredentials()
    decoded = decode_access_token(authorization.split(" ", 1)[1])
    if not decoded or decoded.get("scope") != "helper" or decoded.get("profile_id") != str(profile_id):
        raise PermissionDenied("Invalid helper token for this profile")

    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    # Token's `sub` is the admin who issued it; verify still admin.
    issuer = await db.get(User, uuid.UUID(decoded["sub"]))
    if not issuer or issuer.role != "admin":
        raise PermissionDenied()
    if profile.status == "running_job":
        raise InvalidPayload("Profile is busy running a job")

    if not isinstance(payload.cookies, list) or not payload.cookies:
        raise InvalidPayload("Empty cookies array")
    try:
        count = await profile_manager.import_cookies(profile.profile_path, payload.cookies)
    except Exception as e:  # noqa: BLE001
        raise InvalidPayload(f"Failed to import cookies: {e}")

    profile.status = "logged_in"
    profile.last_login_check_at = datetime.now(timezone.utc)
    profile.error_message = None
    await audit.log_action(db, user_id=issuer.id, action="upload_cookies_helper",
                           target_type="profile", target_id=profile.id,
                           metadata={"count": count})
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/{profile_id}/check-session", response_model=ProfileOut)
async def check_session(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> Profile:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    if profile.status == "running_job":
        raise InvalidPayload("Profile is busy running a job")

    logged_in, err = await profile_manager.check_session(profile.profile_path, profile.provider)
    profile.last_login_check_at = datetime.now(timezone.utc)
    profile.error_message = err
    profile.status = "logged_in" if logged_in else "need_login"
    await audit.log_action(db, user_id=admin.id, action="check_profile",
                           target_type="profile", target_id=profile.id,
                           metadata={"logged_in": logged_in, "error": err})
    await db.commit()
    await db.refresh(profile)
    return profile


PROVIDER_URLS = {"grok": "https://grok.com/", "flow": "https://labs.google/flow"}


@router.post("/{profile_id}/start-vnc-session", response_model=VncSessionOut)
async def start_vnc_session(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> VncSessionOut:
    """Spawn (or reuse) a per-profile VNC+CDP container.

    Frontend embeds noVNC URL in iframe → admin logs in. Container persists
    after admin closes the modal so the worker can attach via CDP.
    """
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    if profile.status == "running_job":
        raise InvalidPayload("Profile is busy running a job")

    provider_url = PROVIDER_URLS.get(profile.provider, "https://grok.com/")
    try:
        info = vnc_manager.start_for_profile(
            profile_id=str(profile.id),
            profile_path=profile.profile_path,
            provider_url=provider_url,
        )
    except Exception as exc:  # noqa: BLE001
        raise InvalidPayload(f"Cannot start VNC: {type(exc).__name__}: {exc}")

    profile.status = "opening"
    await audit.log_action(db, user_id=admin.id, action="start_vnc_session",
                           target_type="profile", target_id=profile.id,
                           metadata={"container": info["container_name"], "reused": info.get("reused")})
    await db.commit()

    base = settings.cors_origin_list[0] if settings.cors_origin_list else ""
    # Per-profile noVNC route. Nginx proxies /vnc/<short-id>/ → <container>:6901
    # `path` param tells noVNC to open WS at /vnc/<short>/websockify (its default
    # 'websockify' resolves to root, breaking the routing).
    short = str(profile.id).replace("-", "")[:12]
    # resize=scale → noVNC scales the remote framebuffer to fit the iframe,
    # so the desktop is fully visible regardless of the iframe size.
    iframe_url = (
        f"{base}/vnc/{short}/vnc.html"
        f"?autoconnect=1&resize=scale&path=vnc/{short}/websockify"
    )
    return VncSessionOut(
        profile_id=profile.id,
        iframe_url=iframe_url,
        username="",
        password="",
        expires_in=86400,
    )


@router.post("/{profile_id}/finish-vnc-session", response_model=ProfileOut)
async def finish_vnc_session(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> Profile:
    """Mark profile as ready. Container KEEPS RUNNING for worker CDP attach."""
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)

    # Quick session check via the running CDP browser (lighter than spawning new headless).
    info = vnc_manager.get_for_profile(str(profile.id))
    if info and info.get("running"):
        profile.status = "logged_in"
        profile.error_message = None
    else:
        profile.status = "need_login"
        profile.error_message = "VNC container not running"
    profile.last_login_check_at = datetime.now(timezone.utc)
    await audit.log_action(db, user_id=admin.id, action="finish_vnc_session",
                           target_type="profile", target_id=profile.id,
                           metadata={"status": profile.status})
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/{profile_id}/stop-vnc", response_model=ProfileOut)
async def stop_vnc(profile_id: uuid.UUID, admin: AdminUser, db: DbSession) -> Profile:
    """Stop and remove the VNC+CDP container for this profile.

    Use this if you want to free RAM or force a fresh login next time.
    Profile drops to need_login.
    """
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    try:
        vnc_manager.stop_for_profile(str(profile.id))
    except Exception:  # noqa: BLE001
        pass
    profile.status = "need_login"
    profile.error_message = None
    await audit.log_action(db, user_id=admin.id, action="stop_vnc",
                           target_type="profile", target_id=profile.id)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/vnc-session/status", response_model=VncStatusOut)
async def vnc_session_status(_admin: AdminUser) -> VncStatusOut:
    return VncStatusOut(**vnc_manager.get_status())


@router.post("/{profile_id}/disable", response_model=ProfileOut)
async def disable_profile(profile_id: uuid.UUID, _admin: AdminUser, db: DbSession) -> Profile:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    await _assert_profile_accessible(db, admin, profile)
    profile.status = "disabled"
    await db.commit()
    await db.refresh(profile)
    return profile
