from fastapi import APIRouter, Header
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import EmailAlreadyRegistered, InvalidCredentials
from app.core.security import create_access_token, hash_password, verify_password
from app.core.exceptions import AppError
from app.models import Domain, Plan, Role, ToolInstall, User
from app.modules.admin.audit import service as audit
from app.modules.entitlements.service import get_effective_entitlements

from .schemas import (
    EntitlementsResponse,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, db: DbSession,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> TokenResponse:
    # Enforce per-install policy BEFORE checking credentials, so an
    # unapproved kiosk can never log anyone in (even with a valid
    # password). Rules when the header is present:
    #   1. Install must exist and be status=active.
    #   2. If assigned_user_id is set, only that user's email is allowed.
    # (Account scope separation — see below — runs AFTER user lookup.)
    # Resolve install (still needed even before user lookup) so we know
    # the machine context for both the install-side checks below and the
    # account-scope check after the user is fetched.
    install: ToolInstall | None = None
    if x_tool_install_id:
        install = (await db.execute(
            select(ToolInstall).where(ToolInstall.tool_id == x_tool_install_id)
        )).scalar_one_or_none()
        if not install:
            raise AppError(
                403, "tool_install_unknown",
                "Máy này chưa được đăng ký. Mở lại app để tự đăng ký rồi nhờ admin duyệt.",
            )
        if install.status != "active":
            raise AppError(
                403, "tool_install_not_active",
                f"Máy này đang ở trạng thái '{install.status}'. Liên hệ admin để duyệt.",
            )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Kiosk pin (install.assigned_user_id). Skip for super_admin/admin so
    # ops can always get in to debug. For everyone else: email must match
    # the pinned account.
    if install is not None and install.assigned_user_id is not None:
        if not user or user.role not in ("super_admin", "admin"):
            pinned = await db.get(User, install.assigned_user_id)
            if pinned and pinned.email.lower() != payload.email.strip().lower():
                raise AppError(
                    403, "tool_install_pinned",
                    "Máy này đã được gán cho tài khoản khác. Liên hệ admin nếu cần đổi.",
                )

    # Account scope separation — domain users vs tool users vs super_admin.
    # super_admin & admin can log in anywhere (operations need to access
    # both surfaces). Regular users are pinned to one scope:
    #   - user.tool_install_id set  → can only log in from THAT install
    #   - user.domain_id set        → can only log in from web (no header)
    #   - both NULL                 → wildcard (legacy / pre-tool users)
    if user and user.role not in ("super_admin", "admin"):
        if install is not None:
            # Request came from a tool install. The user MUST be tool-
            # scoped to this same install.
            if user.tool_install_id is None:
                await audit.log_action(
                    db, user_id=user.id, action="login_failed",
                    target_type="user", target_id=user.id,
                    metadata={"reason": "domain_user_on_tool", "tool_id": x_tool_install_id},
                )
                await db.commit()
                raise AppError(
                    403, "wrong_scope_domain_user",
                    "Tài khoản này dùng cho web, không dùng cho desktop tool.",
                )
            if user.tool_install_id != install.id:
                await audit.log_action(
                    db, user_id=user.id, action="login_failed",
                    target_type="user", target_id=user.id,
                    metadata={"reason": "wrong_tool_install", "tool_id": x_tool_install_id},
                )
                await db.commit()
                raise AppError(
                    403, "wrong_tool_install",
                    "Tài khoản này thuộc một máy khác, không dùng được trên máy này.",
                )
        else:
            # Request came from web. The user must NOT be tool-scoped.
            if user.tool_install_id is not None:
                await audit.log_action(
                    db, user_id=user.id, action="login_failed",
                    target_type="user", target_id=user.id,
                    metadata={"reason": "tool_user_on_web"},
                )
                await db.commit()
                raise AppError(
                    403, "wrong_scope_tool_user",
                    "Tài khoản này chỉ dùng được trên desktop tool đã được cấp.",
                )

    # Audit failures too — brute-force / credential-stuffing patterns only
    # show up if both halves of the pair are logged. We record by email
    # (not user_id) when the account doesn't exist, so the audit row still
    # surfaces in the dashboard. Status='inactive' is treated as a credential
    # failure (don't leak account existence + don't issue a token).
    if not user or not verify_password(payload.password, user.password_hash) or user.status != "active":
        await audit.log_action(
            db,
            user_id=user.id if user else None,
            action="login_failed",
            target_type="user",
            target_id=user.id if user else None,
            metadata={
                "email": payload.email,
                "reason": (
                    "user_not_found" if not user
                    else "wrong_password" if user.status == "active"
                    else "inactive"
                ),
            },
        )
        await db.commit()
        raise InvalidCredentials()

    # Domain billing / status check — block login when the tenant the user
    # belongs to has been disabled (manual freeze, non-payment, etc).
    # super_admin is unscoped, never bound to a domain → always allowed.
    if user.role != "super_admin" and user.domain_id:
        domain = await db.get(Domain, user.domain_id)
        if domain and domain.status == "disabled":
            await audit.log_action(
                db,
                user_id=user.id,
                action="login_failed",
                target_type="user",
                target_id=user.id,
                metadata={
                    "email": payload.email,
                    "reason": "domain_disabled",
                    "domain_id": str(domain.id),
                },
            )
            await db.commit()
            raise AppError(
                403, "domain_disabled",
                "Tenant đang bị tạm dừng. Liên hệ admin để kích hoạt lại.",
            )

    token = create_access_token(subject=str(user.id), extra={"role": user.role})
    await audit.log_action(db, user_id=user.id, action="login", target_type="user", target_id=user.id)
    await db.commit()
    return TokenResponse(access_token=token, expires_in=settings.JWT_EXPIRES_MINUTES * 60)


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    db: DbSession,
    host: str | None = Header(default=None),
) -> TokenResponse:
    """Self-serve signup. Creates a user on the default (Free) plan and returns a JWT.

    Multi-tenant: the user is bound to the domain they signed up from. We
    derive that from the Host header (set by nginx via `proxy_set_header
    Host $host`). If the host has no matching Domain row, the user gets
    domain_id=NULL — they're attached to the global wildcard `*` and only
    visible to super_admin.
    """
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise EmailAlreadyRegistered()

    default_plan = (await db.execute(select(Plan).where(Plan.is_default.is_(True)))).scalar_one_or_none()

    # Resolve the originating domain. Strip the port if present.
    domain_id = None
    if host:
        h = host.split(":", 1)[0].strip().lower()
        d = (await db.execute(select(Domain).where(Domain.hostname == h))).scalar_one_or_none()
        if d and d.hostname != "*":
            domain_id = d.id

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="user",
        status="active",
        plan_id=default_plan.id if default_plan else None,
        domain_id=domain_id,
    )
    db.add(user)
    await db.flush()
    await audit.log_action(
        db,
        user_id=user.id,
        action="register",
        target_type="user",
        target_id=user.id,
        metadata={"plan": default_plan.code if default_plan else None},
    )
    await db.commit()

    token = create_access_token(subject=str(user.id), extra={"role": user.role})
    return TokenResponse(access_token=token, expires_in=settings.JWT_EXPIRES_MINUTES * 60)


@router.post("/logout")
async def logout() -> dict:
    # Stateless JWT — client just drops the token. Endpoint kept for API parity.
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(
    user: CurrentUser, db: DbSession,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> MeResponse:
    # Scope enforcement at the /me level too — not just login. Without
    # this a tool user could pop their token into the browser (where no
    # X-Tool-Install-Id is injected) and explore the admin shell with a
    # still-valid token. With this guard the FE's axios interceptor
    # picks up the 403 and force-logs them out.
    # super_admin / admin bypass (they may need to support-debug both
    # surfaces with the same browser).
    if user.role == "user":
        if user.tool_install_id is not None:
            # Tool-scoped user must present the matching header on every
            # /me call. Wrong header (or missing) → fail closed.
            if not x_tool_install_id:
                raise AppError(
                    403, "wrong_scope_tool_user",
                    "Tài khoản này chỉ dùng được trên desktop tool đã được cấp.",
                )
            from app.models import ToolInstall
            install = (await db.execute(
                select(ToolInstall).where(ToolInstall.tool_id == x_tool_install_id)
            )).scalar_one_or_none()
            if not install or install.id != user.tool_install_id:
                raise AppError(
                    403, "wrong_tool_install",
                    "Tài khoản này thuộc một máy khác, không dùng được trên máy này.",
                )
        elif x_tool_install_id:
            # Domain user trying to use a desktop install — symmetrical block.
            raise AppError(
                403, "wrong_scope_domain_user",
                "Tài khoản này dùng cho web, không dùng cho desktop tool.",
            )

    eff = await get_effective_entitlements(db, user)
    # Resolve effective allowed_pages.
    #
    #   super_admin → no restriction (None).
    #   admin       → always the full domain.allowed_pages. The named role_id
    #                 is only meant to narrow regular users; an admin should
    #                 manage everything their domain grants.
    #   user        → role.allowed_pages ∩ domain.allowed_pages (or just
    #                 domain.allowed_pages when no role is set).
    effective_pages: list[str] | None = None
    role_name: str | None = None
    # role_name is informational only — show it even for admin tier so the
    # UI can label the assignment.
    if user.role_id:
        role = await db.get(Role, user.role_id)
        if role and role.status == "active":
            role_name = role.name

    if user.role == "super_admin":
        # leave effective_pages None — no restriction
        pass
    elif user.role == "admin":
        if user.domain_id:
            domain = await db.get(Domain, user.domain_id)
            if domain and not domain.allow_all_pages:
                effective_pages = list(domain.allowed_pages or [])
    else:
        # user / support tier
        if user.role_id:
            role = await db.get(Role, user.role_id)
            if role and role.status == "active":
                if user.domain_id:
                    domain = await db.get(Domain, user.domain_id)
                    if domain and not domain.allow_all_pages:
                        dom_set = set(domain.allowed_pages or [])
                        effective_pages = [p for p in (role.allowed_pages or []) if p in dom_set]
                    else:
                        effective_pages = list(role.allowed_pages or [])
                else:
                    effective_pages = list(role.allowed_pages or [])
        elif user.domain_id:
            domain = await db.get(Domain, user.domain_id)
            if domain and not domain.allow_all_pages:
                effective_pages = list(domain.allowed_pages or [])

    # Tool-install enforcement: intersect (or restrict) the user's allowed
    # pages with the install's allowed_pages when the request comes from a
    # registered desktop client. Rules:
    #   - status != active                  → empty list (no pages)
    #   - install.allow_all_pages           → no further restriction
    #   - install has allowed_pages set     → intersect with user's pages
    #                                        (None on the user side means
    #                                         "no domain/role restriction" →
    #                                         install pages become the
    #                                         effective allowlist)
    # super_admin is normally unscoped (effective_pages=None). We still
    # apply the install's restrictions because the "phân quyền theo
    # tool_id" model overrides — admin explicitly said the kiosk should
    # only show certain pages, regardless of who logs in.
    if x_tool_install_id:
        install = (await db.execute(
            select(ToolInstall).where(ToolInstall.tool_id == x_tool_install_id)
        )).scalar_one_or_none()
        if install:
            if install.status != "active":
                effective_pages = []
            elif not install.allow_all_pages:
                install_pages = set(install.allowed_pages or [])
                if effective_pages is None:
                    effective_pages = sorted(install_pages)
                else:
                    effective_pages = [p for p in effective_pages if p in install_pages]
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        domain_id=user.domain_id,
        tool_install_id=user.tool_install_id,
        role_id=user.role_id,
        role_name=role_name,
        effective_allowed_pages=effective_pages,
        entitlements=EntitlementsResponse(**eff),
        locale=user.locale,
        notification_prefs=user.notification_prefs,
    )
