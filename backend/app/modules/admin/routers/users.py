"""/api/admin/users — admin CRUD over user rows."""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.core.security import hash_password
from datetime import datetime, timezone

from app.models import Plan, Subscription, User
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    EffectiveEntitlementsOut,
)
from app.modules.entitlements.service import get_effective_entitlements
from app.modules.admin.services.tenancy import (
    NULL_FK_SENTINEL,
    assert_can_touch,
    scope_users_query,
    validate_role_id_for_domain,
)

router = APIRouter()


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(admin: AdminUser, db: DbSession) -> list[User]:
    q = scope_users_query(select(User).order_by(User.created_at.desc()), admin)
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: AdminUserCreate, admin: AdminUser, db: DbSession) -> User:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")
    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")

    # Role + domain rules:
    #   super_admin can create any role in any domain (uses payload.domain_id);
    #   admin can create role=user|admin in THEIR domain only, never super_admin.
    if admin.role != "super_admin":
        if payload.role == "super_admin":
            raise PermissionDenied("Không có quyền tạo super_admin")
        target_domain = admin.domain_id  # force into admin's own domain
    else:
        target_domain = payload.domain_id

    role_id = await validate_role_id_for_domain(db, payload.role_id, target_domain)

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        status="active",
        plan_id=payload.plan_id,
        domain_id=target_domain,
        role_id=role_id,
    )
    db.add(user)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_user", target_type="user", target_id=user.id,
        metadata={"email": user.email, "role": user.role, "plan_id": str(payload.plan_id) if payload.plan_id else None},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, admin: AdminUser, db: DbSession) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    assert_can_touch(admin, user)
    if payload.role == "super_admin" and admin.role != "super_admin":
        raise PermissionDenied("Không có quyền cấp super_admin")
    if (
        payload.domain_id is not None
        and admin.role != "super_admin"
        and payload.domain_id != admin.domain_id
    ):
        raise PermissionDenied("Không có quyền chuyển user sang domain khác")
    changes: dict = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.role is not None:
        user.role = payload.role
        changes["role"] = payload.role
    if payload.status is not None:
        prev_status = user.status
        user.status = payload.status
        changes["status"] = payload.status
        # Alert super_admin + domain admins khi 1 user vừa bị ban —
        # họ có thể cần liên hệ khách hoặc revert nếu nhầm. Skip khi
        # status không đổi hoặc đổi sang active (unban không cần alert).
        if payload.status == "banned" and prev_status != "banned":
            try:
                from app.modules.admin.notifications import service as _notif
                await _notif.notify_admins_async(
                    db, domain_id=user.domain_id,
                    kind="user_banned",
                    title=f"User bị ban — {user.email}",
                    body=f"Admin {admin.email} vừa chuyển {user.email} sang banned.",
                    target_url=f"/admin/users?id={user.id}",
                    severity="warning",
                )
            except Exception:  # noqa: BLE001
                pass  # notification best-effort
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changes["password"] = "***"
    if payload.plan_id is not None:
        if str(payload.plan_id) == NULL_FK_SENTINEL:
            user.plan_id = None
            changes["plan_id"] = None
            # Clearing plan = cancel any active manual subs.
            await db.execute(
                Subscription.__table__.update()
                .where(
                    Subscription.user_id == user.id,
                    Subscription.status == "active",
                )
                .values(status="cancelled", cancelled_at=datetime.now(timezone.utc))
            )
        else:
            new_plan = await db.get(Plan, payload.plan_id)
            if not new_plan:
                raise InvalidPayload("Plan không tồn tại")
            user.plan_id = payload.plan_id
            changes["plan_id"] = str(payload.plan_id)
            # Admin upgrade flow: the entitlement resolver requires an
            # active Subscription row to honor a paid plan (so payment
            # failures auto-downgrade). When admin grants a plan manually
            # (no billing), we still need that row → upsert one with
            # provider="manual" so resolve_user_plan_with_status picks it
            # up immediately. Cancel any non-matching active subs first.
            await db.execute(
                Subscription.__table__.update()
                .where(
                    Subscription.user_id == user.id,
                    Subscription.status == "active",
                    Subscription.plan_id != payload.plan_id,
                )
                .values(status="cancelled", cancelled_at=datetime.now(timezone.utc))
            )
            existing = (await db.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == user.id,
                    Subscription.plan_id == payload.plan_id,
                )
                .order_by(Subscription.created_at.desc())
                .limit(1)
            )).scalar_one_or_none()
            if existing:
                existing.status = "active"
                existing.cancelled_at = None
                existing.cancel_at_period_end = False
            else:
                db.add(Subscription(
                    user_id=user.id,
                    plan_id=payload.plan_id,
                    status="active",
                    billing_cycle="monthly",
                    provider="manual",
                    amount=0,
                    currency="VND",
                ))
    if payload.entitlement_overrides is not None:
        user.entitlement_overrides = payload.entitlement_overrides or None
        changes["entitlement_overrides"] = "set" if payload.entitlement_overrides else "cleared"
    if payload.domain_id is not None and admin.role == "super_admin":
        if str(payload.domain_id) == NULL_FK_SENTINEL:
            user.domain_id = None
            user.role_id = None
            changes["domain_id"] = None
        else:
            if user.domain_id != payload.domain_id:
                user.role_id = None
            user.domain_id = payload.domain_id
            changes["domain_id"] = str(payload.domain_id)
    if payload.role_id is not None:
        user.role_id = await validate_role_id_for_domain(
            db, payload.role_id, user.domain_id,
        )
        changes["role_id"] = str(user.role_id) if user.role_id else None
    # Tool-install assignment (super_admin only). Mutex with domain: when
    # admin sets a tool_install_id the user becomes kiosk-bound and any
    # previous domain attachment is cleared. Likewise when domain_id was
    # just set above, we already implicitly cleared tool_install via the
    # `if str(payload.domain_id) != NULL_FK_SENTINEL` branch — handle that
    # symmetrically here for the reverse direction.
    if payload.tool_install_id is not None and admin.role == "super_admin":
        from app.models.tool_install import ToolInstall as _ToolInstall
        if str(payload.tool_install_id) == NULL_FK_SENTINEL:
            user.tool_install_id = None
            changes["tool_install_id"] = None
        else:
            ti = await db.get(_ToolInstall, payload.tool_install_id)
            if not ti:
                raise InvalidPayload("Tool install không tồn tại")
            user.tool_install_id = payload.tool_install_id
            user.domain_id = None
            user.role_id = None
            changes["tool_install_id"] = str(payload.tool_install_id)
            changes["domain_id"] = None  # mutex cleared
    elif (
        payload.domain_id is not None
        and admin.role == "super_admin"
        and str(payload.domain_id) != NULL_FK_SENTINEL
        and user.tool_install_id is not None
    ):
        # Caller swapped domain on a kiosk-bound user — clear the install
        # binding so the mutex invariant stays valid.
        user.tool_install_id = None
        changes["tool_install_id"] = None
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_user", target_type="user", target_id=user.id,
        metadata=changes,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    if user_id == admin.id:
        raise InvalidPayload("Không thể tự xóa chính mình")
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    assert_can_touch(admin, user)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_user", target_type="user", target_id=user.id,
        metadata={"email": user.email},
    )
    await db.delete(user)
    await db.commit()


from pydantic import BaseModel, EmailStr, Field
from app.models import ApiKey, Domain
from app.models.tool_install import ToolInstall
from app.core.security import generate_api_key


class QuickProvisionNewDomain(BaseModel):
    """Inline domain creation alongside the user. Use this when the
    customer needs their own scoped pool/quota and no existing domain
    fits."""
    hostname: str = Field(min_length=1, max_length=255)
    label: str | None = None
    jobs_quota_per_day: int | None = Field(default=None, ge=0)


class QuickProvisionIn(BaseModel):
    """One-shot bundle to provision a customer in 1 round-trip:
    [optional new domain] + user + [optional API key].

    Use cases this collapses:
      - reseller onboards 1 customer → would otherwise be 3-4 separate
        admin clicks (create domain, create plan if needed, create user,
        create API key)
      - QA / sales demo → spin up a sandbox account with a key in seconds
    """
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="user", pattern="^(user|admin|support)$")
    plan_id: uuid.UUID | None = None

    # Pick exactly ONE scope target:
    #   - domain_id            → user belongs to existing tenant domain
    #   - new_domain           → create+attach a fresh domain inline
    #   - tool_install_id      → user belongs to a desktop kiosk install
    #                            (mutually exclusive with domain — backend
    #                             constraint says user has EITHER domain
    #                             OR tool_install, never both)
    # All empty = no scope (super_admin only).
    domain_id: uuid.UUID | None = None
    new_domain: QuickProvisionNewDomain | None = None
    tool_install_id: uuid.UUID | None = None
    pin_as_only_user: bool = Field(
        default=False,
        description="When tool_install_id is set, also set the install's "
                    "assigned_user_id so nobody else can log in on this kiosk.",
    )

    # API key options. When create_api_key=true an `uxpm_live_*` key is
    # generated and returned in plaintext exactly ONCE in the response.
    create_api_key: bool = False
    api_key_name: str = Field(default="default", min_length=1, max_length=120)
    api_key_providers: list[str] = Field(default_factory=lambda: ["grok"])
    api_key_job_types: list[str] = Field(default_factory=lambda: ["image", "video"])
    api_key_daily_limit: int = Field(default=1000, ge=1, le=100000)


class QuickProvisionOut(BaseModel):
    user_id: uuid.UUID
    user_email: str
    domain_id: uuid.UUID | None
    domain_hostname: str | None
    tool_install_id: uuid.UUID | None = None
    tool_install_label: str | None = None
    api_key: str | None = None
    api_key_id: uuid.UUID | None = None
    api_key_prefix: str | None = None
    login_url: str
    note: str


@router.post("/users/quick-provision", response_model=QuickProvisionOut, status_code=status.HTTP_201_CREATED)
async def quick_provision(
    payload: QuickProvisionIn, admin: AdminUser, db: DbSession,
) -> QuickProvisionOut:
    """1-click customer onboard. Wraps create-domain + create-user +
    create-api-key in a single transaction so a partial failure rolls
    back everything (e.g. duplicate email won't leave an orphan domain).
    """
    # Exactly one scope target. Pre-flight check beats DB constraint
    # violations.
    scope_targets = sum(bool(x) for x in (payload.domain_id, payload.new_domain, payload.tool_install_id))
    if scope_targets > 1:
        raise InvalidPayload(
            "Chọn duy nhất 1 trong: domain_id, new_domain, tool_install_id"
        )

    # Pre-check duplicate email so we don't waste a domain insert on it.
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")

    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")

    # Role / domain rules mirror create_user() above.
    if admin.role != "super_admin":
        if payload.role == "super_admin":
            raise PermissionDenied("Không có quyền tạo super_admin")
        if payload.new_domain:
            raise PermissionDenied("Chỉ super_admin được tạo domain mới")
        if payload.tool_install_id:
            raise PermissionDenied("Chỉ super_admin được gán Tool Install")
        target_domain = admin.domain_id
    else:
        target_domain = payload.domain_id

    # Tool-install path is mutually exclusive with domain (DB-level
    # constraint). When set, the user is kiosk-bound and has no domain.
    install_row: ToolInstall | None = None
    if payload.tool_install_id:
        install_row = await db.get(ToolInstall, payload.tool_install_id)
        if not install_row:
            raise InvalidPayload("Tool install không tồn tại")
        target_domain = None

    # Inline domain creation (super_admin only).
    new_domain_row: Domain | None = None
    if payload.new_domain:
        # Conflict check on hostname so the unique-index error becomes a
        # clean 400 instead of a 500.
        dup = (await db.execute(
            select(Domain).where(Domain.hostname == payload.new_domain.hostname)
        )).scalar_one_or_none()
        if dup:
            raise InvalidPayload(
                f"Domain {payload.new_domain.hostname} đã tồn tại — dùng domain_id thay vì new_domain"
            )
        new_domain_row = Domain(
            hostname=payload.new_domain.hostname,
            label=payload.new_domain.label or payload.new_domain.hostname,
            status="active",
            jobs_quota_per_day=payload.new_domain.jobs_quota_per_day,
        )
        db.add(new_domain_row)
        await db.flush()
        target_domain = new_domain_row.id

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        status="active",
        plan_id=payload.plan_id,
        domain_id=target_domain,
        tool_install_id=install_row.id if install_row else None,
    )
    db.add(user)
    await db.flush()

    # Pin the install to this user so other tool-scoped accounts can't
    # later steal the kiosk session. Only applies in the tool-install
    # path; ignored when caller picked a domain instead.
    if install_row and payload.pin_as_only_user:
        install_row.assigned_user_id = user.id

    full_key: str | None = None
    key_id: uuid.UUID | None = None
    key_prefix: str | None = None
    if payload.create_api_key:
        full_key, key_prefix, key_hash = generate_api_key()
        api_key = ApiKey(
            user_id=user.id,
            name=payload.api_key_name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            allowed_providers=payload.api_key_providers,
            allowed_job_types=payload.api_key_job_types,
            daily_limit=payload.api_key_daily_limit,
        )
        db.add(api_key)
        await db.flush()
        key_id = api_key.id

    await audit.log_action(
        db, user_id=admin.id, action="admin_quick_provision",
        target_type="user", target_id=user.id,
        metadata={
            "email": user.email,
            "role": user.role,
            "plan_id": str(payload.plan_id) if payload.plan_id else None,
            "domain_id": str(target_domain) if target_domain else None,
            "new_domain": payload.new_domain.hostname if payload.new_domain else None,
            "tool_install_id": str(install_row.id) if install_row else None,
            "pin_as_only_user": payload.pin_as_only_user if install_row else False,
            "with_api_key": payload.create_api_key,
        },
    )
    await db.commit()

    # Build the login URL. Tool-install accounts log in only from the
    # kiosk app, so the URL is informational ("Open the desktop app");
    # domain users get the hostname they were assigned to.
    host: str | None = None
    if install_row:
        # No URL for kiosk-bound accounts — leave host empty, note covers it.
        host = None
    elif new_domain_row:
        host = new_domain_row.hostname
    elif target_domain:
        d = await db.get(Domain, target_domain)
        host = d.hostname if d else None
    login_url = f"https://{host}/" if host else (
        "Mở app GrokFlow Desktop trên máy đã đăng ký tool install này"
        if install_row else "/"
    )

    note = (
        "Lưu lại api_key — chỉ hiện 1 lần. Gửi cho khách kèm login_url + email/password."
        if full_key
        else "Gửi khách: login_url + email + password tạm. Khách đổi password lần đầu."
    )

    return QuickProvisionOut(
        user_id=user.id,
        user_email=user.email,
        domain_id=target_domain,
        domain_hostname=host,
        tool_install_id=install_row.id if install_row else None,
        tool_install_label=(install_row.label or install_row.tool_id) if install_row else None,
        api_key=full_key,
        api_key_id=key_id,
        api_key_prefix=key_prefix,
        login_url=login_url,
        note=note,
    )


@router.get("/users/{user_id}/effective-entitlements", response_model=EffectiveEntitlementsOut)
async def user_effective_entitlements(
    user_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> EffectiveEntitlementsOut:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    assert_can_touch(admin, user)
    eff = await get_effective_entitlements(db, user)
    return EffectiveEntitlementsOut(**eff)
