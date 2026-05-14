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
from app.core.deps import SuperAdminUser
from app.services.nginx_sync import refresh_vnc_map
from app.models import Domain, Profile, ProfileDomainAssignment, User
from app.modules.admin.audit import service as audit


async def _assert_profile_accessible(
    db, admin: User, profile: Profile,
) -> None:
    """Tenant guard for any single-row Profile op done by an admin.

    super_admin: passes.
    admin: passes if EITHER
      - the profile's owner lives in the admin's domain (legacy: admin
        manages a profile their own users created), OR
      - the profile is explicitly assigned to the admin's domain via
        ProfileDomainAssignment (the super_admin grants a pool profile
        to a tenant domain — same rule that makes it appear in
        list_profiles).
    Anyone else: caller shouldn't have hit this — endpoints gate with
    AdminUser dep first.
    """
    if admin.role == "super_admin":
        return
    owner = await db.get(User, profile.user_id)
    if owner and owner.domain_id == admin.domain_id:
        return
    # Assigned-to-tenant case. Mirror the visibility join used in
    # list_profiles() so "I can see it" implies "I can act on it".
    from app.models import ProfileDomainAssignment
    assigned = (await db.execute(
        select(ProfileDomainAssignment.id).where(
            ProfileDomainAssignment.profile_id == profile.id,
            ProfileDomainAssignment.domain_id == admin.domain_id,
        )
    )).first()
    if assigned:
        return
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
    """super_admin sees all profiles; per-domain admin sees own-domain
    profiles + profiles assigned to its domain via the join table;
    customers see logged_in admin-owned profiles their domain has access to.

    Visibility for non-super-admins now folds two rules together via
    `_profile_visible_to_domain_subq`:

      (a) Profile owner is in the requester's domain (legacy direct ownership), OR
      (b) An explicit (profile, requester_domain) row exists in
          profile_domain_assignments — super_admin loans a profile to a tenant.

    With rule (b) a super_admin running profiles in their own platform domain
    can hand-pick which tenants get to see each profile, fixing the old
    behaviour where super_admin's profiles were invisible to any tenant.
    """
    base = select(Profile).where(Profile.status != "deleted")

    if user.role == "super_admin":
        q = base.order_by(Profile.created_at.desc())
    elif user.role == "admin":
        q = (
            base.join(User, User.id == Profile.user_id)
            .where(
                (User.domain_id == user.domain_id)
                | Profile.id.in_(_profile_ids_assigned_to_domain(user.domain_id))
            )
            .order_by(Profile.created_at.desc())
        )
    else:
        # Customer pool: admin-owned, logged_in, visible to my domain.
        q = (
            select(Profile)
            .join(User, User.id == Profile.user_id)
            .where(
                User.role.in_(("admin", "super_admin")),
                Profile.status == "logged_in",
                (User.domain_id == user.domain_id)
                | Profile.id.in_(_profile_ids_assigned_to_domain(user.domain_id)),
            )
            .order_by(Profile.created_at.desc())
        )
    result = await db.execute(q)
    return list(result.scalars().all())


def _profile_ids_assigned_to_domain(domain_id):
    """Sub-select of profile IDs explicitly assigned to `domain_id`.
    Inline-able into a WHERE … IN (…) clause."""
    from app.models import ProfileDomainAssignment

    return (
        select(ProfileDomainAssignment.profile_id)
        .where(ProfileDomainAssignment.domain_id == domain_id)
        .scalar_subquery()
    )


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
    # Reject obvious garbage before handing to profile_manager — a malformed
    # cookie store can wedge the profile (Playwright fails to load it next time).
    # Each entry must look like a Playwright cookie: dict with at least name+value.
    if len(cookies) > 1000:
        raise InvalidPayload("Cookies file has too many entries (max 1000)")
    for i, c in enumerate(cookies):
        if not isinstance(c, dict):
            raise InvalidPayload(f"Cookies[{i}] must be an object")
        if not isinstance(c.get("name"), str) or not c["name"]:
            raise InvalidPayload(f"Cookies[{i}].name is required (string)")
        if "value" not in c or not isinstance(c["value"], str):
            raise InvalidPayload(f"Cookies[{i}].value is required (string)")
        # domain/path/expires are optional but if present must be the right type
        if "domain" in c and not isinstance(c["domain"], str):
            raise InvalidPayload(f"Cookies[{i}].domain must be a string")
        if "expires" in c and not isinstance(c["expires"], (int, float)):
            raise InvalidPayload(f"Cookies[{i}].expires must be a number")

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

    # Tell nginx where this new container lives so the iframe URL routes.
    # No-op when the host vhost dir isn't mounted (dev / tests).
    refresh_vnc_map()

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
    # Container is gone; drop it from the nginx VNC map.
    refresh_vnc_map()
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


# ─── Profile ↔ Domain assignment surface ────────────────────────────────
# Only super_admin manages assignments. Per-domain admin can read its own
# domain's assigned set (read-only).

class ProfileDomainsOut(BaseModel):
    profile_id: uuid.UUID
    domain_ids: list[uuid.UUID]


class ProfileDomainsUpdate(BaseModel):
    domain_ids: list[uuid.UUID]


@router.get("/{profile_id}/domains", response_model=ProfileDomainsOut)
async def get_profile_domains(
    profile_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> ProfileDomainsOut:
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")
    if user.role not in ("super_admin", "admin"):
        raise PermissionDenied()
    rows = (
        await db.execute(
            select(ProfileDomainAssignment.domain_id)
            .where(ProfileDomainAssignment.profile_id == profile_id)
        )
    ).scalars().all()
    return ProfileDomainsOut(profile_id=profile_id, domain_ids=list(rows))


@router.put("/{profile_id}/domains", response_model=ProfileDomainsOut)
async def set_profile_domains(
    profile_id: uuid.UUID,
    payload: ProfileDomainsUpdate,
    _super: SuperAdminUser,
    db: DbSession,
) -> ProfileDomainsOut:
    """Replace the set of domains that can see / pick this profile.

    Pass an empty list to revoke all assignments (profile becomes invisible
    to every tenant unless its owner happens to be in their domain).
    """
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise NotFound("profile")

    # Validate every domain_id exists — fail-fast keeps partial writes out
    # of the join table.
    if payload.domain_ids:
        found = (
            await db.execute(
                select(Domain.id).where(Domain.id.in_(payload.domain_ids))
            )
        ).scalars().all()
        missing = set(payload.domain_ids) - set(found)
        if missing:
            raise InvalidPayload(f"Unknown domain_ids: {sorted(str(m) for m in missing)}")

    # Replace = delete-then-insert in one transaction. The join table is
    # tiny (handful of rows per profile) so the simple approach beats a
    # diff-based upsert in clarity.
    await db.execute(
        ProfileDomainAssignment.__table__.delete()
        .where(ProfileDomainAssignment.profile_id == profile_id)
    )
    for did in payload.domain_ids:
        db.add(ProfileDomainAssignment(profile_id=profile_id, domain_id=did))

    await audit.log_action(
        db, user_id=_super.id, action="profile_domains_set",
        target_type="profile", target_id=profile_id,
        metadata={"domain_ids": [str(d) for d in payload.domain_ids]},
    )
    await db.commit()
    return ProfileDomainsOut(profile_id=profile_id, domain_ids=list(payload.domain_ids))
