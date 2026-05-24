from fastapi import APIRouter, Header, Request
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
    payload: LoginRequest, db: DbSession, request: Request,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> TokenResponse:
    # Rate-limit BEFORE bcrypt verify — bcrypt mất ~150ms/attempt, đủ
    # cho password-spray nếu không guard. Lấy IP từ cf-connecting-ip
    # (Cloudflare layer), fallback X-Forwarded-For, fallback client host.
    # See enforce_login_rate_limit comment cho ngưỡng cụ thể.
    from app.core.rate_limit import enforce_login_rate_limit
    client_ip = (
        request.headers.get("cf-connecting-ip")
        or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    await enforce_login_rate_limit(client_ip, payload.email)

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

    # 2FA gate. Apply cho user có totp_enabled=true bất kể role —
    # super_admin set 2FA cho mình thì server tôn trọng.
    # Code chấp nhận: 6-digit TOTP hoặc 10-char backup code.
    if user.totp_enabled and user.totp_secret:
        from app.core.totp import verify_totp_code, verify_backup_code
        provided = (payload.totp_code or "").strip()
        if not provided:
            raise AppError(401, "totp_required", "Cần mã 2FA (6 chữ số từ Authenticator)")
        ok = False
        if len(provided) == 6 and provided.isdigit():
            ok = verify_totp_code(user.totp_secret, provided)
        elif len(provided) == 10:
            # Backup code path. Verify + remove khỏi list (single-use).
            matched, new_codes = verify_backup_code(
                list(user.totp_backup_codes or []), provided,
            )
            if matched:
                user.totp_backup_codes = new_codes
                ok = True
        if not ok:
            await audit.log_action(
                db, user_id=user.id, action="login_failed",
                target_type="user", target_id=user.id,
                metadata={"reason": "totp_invalid", "email": payload.email},
            )
            await db.commit()
            raise AppError(401, "totp_invalid", "Mã 2FA sai hoặc đã dùng")

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

    # Always-allowed pages: self-service core mà mọi user phải truy
    # cập được dù domain/role/install có restrictive thế nào. Logout đã
    # client-side; /account = đổi password/profile của chính mình. Nếu
    # admin muốn user KHÔNG đổi được, dùng status=banned thay vì cắt
    # /account khỏi allowed_pages (sẽ tự append lại ở đây).
    ALWAYS_ALLOWED = {"/account"}
    if effective_pages is not None:
        for page in ALWAYS_ALLOWED:
            if page not in effective_pages:
                effective_pages.append(page)
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


# ─── Account self-service ────────────────────────────────────────────────
# User-facing endpoints to update their own profile + change password.
# Mirror /api/admin/users/{id} but scoped to `user.id` automatically so
# operators get the "edit my account" UX without admin privileges.

from pydantic import BaseModel, Field, EmailStr


class UpdateProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    locale: str | None = Field(default=None, max_length=10)


class ChangePasswordIn(BaseModel):
    """Require the current password — guards against shoulder-surfing
    attacks where someone walks up to an unlocked session and changes
    the password to lock the real user out."""
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.patch("/me", response_model=MeResponse)
async def update_self(
    payload: UpdateProfileIn, user: CurrentUser, db: DbSession,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> MeResponse:
    """Edit own profile fields. Email change conflicts with existing
    accounts return 400 — no silent overwrite. Returns the full /me
    payload so the client refreshes auth store in one round-trip."""
    if payload.email and payload.email != user.email:
        dup = (await db.execute(
            select(User).where(User.email == payload.email, User.id != user.id)
        )).scalar_one_or_none()
        if dup:
            raise AppError(400, "email_taken", "Email đã có người dùng")
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.locale is not None:
        user.locale = payload.locale
    await db.commit()
    await db.refresh(user)
    # Reuse the /me builder so role / domain / install scoping stays
    # consistent — caller gets exactly the same shape as before.
    return await me(user=user, db=db, x_tool_install_id=x_tool_install_id)


@router.post("/me/password", status_code=204, response_model=None)
async def change_password(
    payload: ChangePasswordIn, user: CurrentUser, db: DbSession,
) -> None:
    """Change own password. Server verifies current_password first to
    prevent unauthorised hijack of an active session."""
    from app.core.security import verify_password
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError(403, "wrong_current_password", "Mật khẩu hiện tại không đúng")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()


# ─── 2FA TOTP ────────────────────────────────────────────────────────────
# Flow:
#   1. User vào /account → click "Bật 2FA" → POST /api/auth/2fa/setup
#      → server tạo secret + lưu encrypted nhưng totp_enabled=false
#      → trả về otpauth URI để FE render QR
#   2. User scan QR bằng Authenticator app → nhập 6-digit code
#      → POST /api/auth/2fa/verify với code
#      → server verify, set totp_enabled=true, sinh + trả 8 backup codes
#   3. Login sau đó cần totp_code
#   4. Disable: POST /api/auth/2fa/disable với password (require auth)

class TotpSetupOut(BaseModel):
    """Trả secret + uri cho FE render QR. Secret cũng show dưới dạng
    text để user nhập manually nếu camera không scan được QR."""
    secret: str
    provisioning_uri: str


class TotpVerifyIn(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpVerifyOut(BaseModel):
    enabled: bool
    backup_codes: list[str]  # plaintext, show 1 lần


class TotpDisableIn(BaseModel):
    """Disable 2FA cần password (chống attacker active session disable
    2FA → giảm khó takeover account về sau)."""
    password: str = Field(min_length=1, max_length=128)


@router.post("/2fa/setup", response_model=TotpSetupOut)
async def totp_setup(user: CurrentUser, db: DbSession) -> TotpSetupOut:
    """Bắt đầu setup 2FA — tạo secret mới (đè secret cũ nếu user re-setup).
    totp_enabled chỉ flip sau khi verify code đầu tiên."""
    from app.core.totp import new_totp_secret, encrypt_secret, provisioning_uri
    secret = new_totp_secret()
    user.totp_secret = encrypt_secret(secret)
    user.totp_enabled = False
    user.totp_backup_codes = None
    await db.commit()
    return TotpSetupOut(
        secret=secret,
        provisioning_uri=provisioning_uri(secret, user.email),
    )


@router.post("/2fa/verify", response_model=TotpVerifyOut)
async def totp_verify(
    payload: TotpVerifyIn, user: CurrentUser, db: DbSession,
) -> TotpVerifyOut:
    """Verify 6-digit code lần đầu → enable 2FA + return 8 backup codes
    (plaintext, chỉ hiện 1 lần). User PHẢI copy/print trước khi đóng."""
    from app.core.totp import verify_totp_code, new_backup_codes
    if not user.totp_secret:
        raise AppError(400, "totp_not_setup", "Chưa setup 2FA — gọi /2fa/setup trước")
    if not verify_totp_code(user.totp_secret, payload.code):
        raise AppError(400, "totp_invalid", "Mã 2FA sai. Thử lại sau ~30s.")
    user.totp_enabled = True
    plaintext, hashed = new_backup_codes(8)
    user.totp_backup_codes = hashed
    await db.commit()
    return TotpVerifyOut(enabled=True, backup_codes=plaintext)


@router.post("/2fa/disable", status_code=204, response_model=None)
async def totp_disable(
    payload: TotpDisableIn, user: CurrentUser, db: DbSession,
) -> None:
    from app.core.security import verify_password
    if not verify_password(payload.password, user.password_hash):
        raise AppError(403, "wrong_password", "Mật khẩu không đúng")
    user.totp_secret = None
    user.totp_enabled = False
    user.totp_backup_codes = None
    await db.commit()
