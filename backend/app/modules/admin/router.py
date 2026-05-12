import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, SuperAdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.core.security import hash_password
from app.core.tenant import (
    assert_same_domain,
    assert_user_in_admin_domain,
    bulk_fetch_map,
    scope_by_domain,
    scope_by_user_domain,
)
from app.models import ApiKey, Invoice, Job, Payment, Plan, Profile, Role, Subscription, User


# Sentinel the FE sends to mean "clear this nullable FK" (PATCH bodies
# can't tell None from "not present" otherwise). Kept identical on FE
# side as `NULL_FK_SENTINEL` in frontend/src/modules/admin/AdminPage.tsx.
NULL_FK_SENTINEL = "00000000-0000-0000-0000-000000000000"


async def _validate_role_id_for_domain(
    db, role_id: uuid.UUID | None, domain_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Ensure a role_id (when set) belongs to the same domain as the user.

    Returns the role_id to assign, or None when the caller passed the zero-uuid
    sentinel (interpreted as "clear the role").
    """
    if role_id is None:
        return None
    if str(role_id) == NULL_FK_SENTINEL:
        return None
    role = await db.get(Role, role_id)
    if not role:
        raise InvalidPayload("Role không tồn tại")
    if domain_id is None or role.domain_id != domain_id:
        raise InvalidPayload("Role phải thuộc cùng domain với user")
    return role_id


def _scope_users_query(q, admin: User):
    """Compat alias — admin/users endpoints scope by users.domain_id directly."""
    return scope_by_domain(q, User.domain_id, admin)


def _assert_can_touch(admin: User, target: User) -> None:
    """Raise if a domain admin tries to act on a user outside their domain.

    Also forbids any non-super admin from touching a super_admin row (tier
    escalation guard). Wraps the generic `assert_same_domain` core helper.
    """
    assert_same_domain(admin, target.domain_id)
    if admin.role != "super_admin" and target.role == "super_admin":
        raise PermissionDenied("Không có quyền sửa super_admin")


# Thin module-level aliases so the rest of the file stays readable. The
# real implementation lives in app.core.tenant — these one-liners just
# pick the right column for billing rows (which use user_id).
def _scope_to_admin_domain(q, user_id_column, admin: User):
    return scope_by_user_domain(q, user_id_column, admin)


async def _assert_billing_owner_in_admin_domain(db, admin: User, user_id):
    return await assert_user_in_admin_domain(db, admin, user_id)
from app.modules.audit import service as audit
from app.modules.entitlements.catalog import FEATURES, LIMITS
from app.modules.entitlements.service import get_effective_entitlements

from .schemas import (
    AdminInvoiceCreate,
    AdminInvoiceOut,
    AdminInvoiceUpdate,
    AdminPaymentCreate,
    AdminPaymentOut,
    AdminPaymentUpdate,
    AdminStats,
    AdminSubscriptionCreate,
    AdminSubscriptionOut,
    AdminSubscriptionUpdate,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    EffectiveEntitlementsOut,
    EntitlementCatalogOut,
    PlanIn,
    PlanOut,
    PlanUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def stats(admin: AdminUser, db: DbSession) -> AdminStats:
    """Counters for the admin dashboard. super_admin sees system-wide
    numbers; per-domain admin sees only their tenant's slice.
    """
    is_super = admin.role == "super_admin"
    # Subquery of user ids in the admin's domain — used to filter every
    # per-tenant count (api_keys/profiles/jobs all FK back to users.user_id).
    domain_user_ids = (
        select(User.id).where(User.domain_id == admin.domain_id)
        if not is_super else None
    )

    def maybe_scope(q, fk_col):
        return q if is_super else q.where(fk_col.in_(domain_user_ids))

    total_users = (await db.execute(
        select(func.count(User.id)) if is_super
        else select(func.count(User.id)).where(User.domain_id == admin.domain_id)
    )).scalar_one()
    total_keys = (await db.execute(
        maybe_scope(select(func.count(ApiKey.id)), ApiKey.user_id)
    )).scalar_one()
    total_profiles = (await db.execute(
        maybe_scope(select(func.count(Profile.id)), Profile.user_id)
    )).scalar_one()
    total_jobs = (await db.execute(
        maybe_scope(select(func.count(Job.id)), Job.user_id)
    )).scalar_one()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    succ = (await db.execute(
        maybe_scope(
            select(func.count(Job.id)).where(
                Job.status == "success", Job.completed_at >= cutoff,
            ),
            Job.user_id,
        )
    )).scalar_one()
    fail = (await db.execute(
        maybe_scope(
            select(func.count(Job.id)).where(
                Job.status == "failed", Job.completed_at >= cutoff,
            ),
            Job.user_id,
        )
    )).scalar_one()
    return AdminStats(
        total_users=total_users,
        total_api_keys=total_keys,
        total_profiles=total_profiles,
        total_jobs=total_jobs,
        jobs_24h_success=succ,
        jobs_24h_failed=fail,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(admin: AdminUser, db: DbSession) -> list[User]:
    q = _scope_users_query(select(User).order_by(User.created_at.desc()), admin)
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

    # Validate role binding (role must belong to the target domain).
    role_id = await _validate_role_id_for_domain(db, payload.role_id, target_domain)

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
    _assert_can_touch(admin, user)
    # A non-super admin can't promote anyone to super_admin.
    if payload.role == "super_admin" and admin.role != "super_admin":
        raise PermissionDenied("Không có quyền cấp super_admin")
    # A non-super admin can't move a user into a different domain.
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
        user.status = payload.status
        changes["status"] = payload.status
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changes["password"] = "***"
    if payload.plan_id is not None:
        # Allow setting plan_id to a sentinel uuid 0...0 to clear it.
        if str(payload.plan_id) == NULL_FK_SENTINEL:
            user.plan_id = None
            changes["plan_id"] = None
        else:
            if not await db.get(Plan, payload.plan_id):
                raise InvalidPayload("Plan không tồn tại")
            user.plan_id = payload.plan_id
            changes["plan_id"] = str(payload.plan_id)
    if payload.entitlement_overrides is not None:
        # Empty dict means "clear overrides".
        user.entitlement_overrides = payload.entitlement_overrides or None
        changes["entitlement_overrides"] = "set" if payload.entitlement_overrides else "cleared"
    if payload.domain_id is not None and admin.role == "super_admin":
        # Sentinel zero-uuid means "clear" (turn into unscoped super-tier).
        if str(payload.domain_id) == NULL_FK_SENTINEL:
            user.domain_id = None
            # Clearing the domain also clears any role (role lives under a domain).
            user.role_id = None
            changes["domain_id"] = None
        else:
            # Drop the existing role if the user is moving to a new domain —
            # the old role won't be valid for the new domain.
            if user.domain_id != payload.domain_id:
                user.role_id = None
            user.domain_id = payload.domain_id
            changes["domain_id"] = str(payload.domain_id)
    if payload.role_id is not None:
        user.role_id = await _validate_role_id_for_domain(
            db, payload.role_id, user.domain_id,
        )
        changes["role_id"] = str(user.role_id) if user.role_id else None
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
    _assert_can_touch(admin, user)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_user", target_type="user", target_id=user.id,
        metadata={"email": user.email},
    )
    await db.delete(user)
    await db.commit()


@router.get("/users/{user_id}/effective-entitlements", response_model=EffectiveEntitlementsOut)
async def user_effective_entitlements(
    user_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> EffectiveEntitlementsOut:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    _assert_can_touch(admin, user)
    eff = await get_effective_entitlements(db, user)
    return EffectiveEntitlementsOut(**eff)


# ---------- Plans CRUD ----------


@router.get("/entitlements/catalog", response_model=EntitlementCatalogOut)
async def entitlement_catalog(_admin: AdminUser) -> EntitlementCatalogOut:
    """List of feature/limit keys + Vietnamese labels for the admin UI."""
    return EntitlementCatalogOut(features=FEATURES, limits=LIMITS)


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(_admin: AdminUser, db: DbSession) -> list[Plan]:
    rows = (await db.execute(select(Plan).order_by(Plan.sort_order, Plan.created_at))).scalars().all()
    return list(rows)


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(payload: PlanIn, admin: SuperAdminUser, db: DbSession) -> Plan:
    if (await db.execute(select(Plan).where(Plan.code == payload.code))).scalar_one_or_none():
        raise InvalidPayload(f"Plan code '{payload.code}' đã tồn tại")
    if payload.is_default:
        # At most one default — clear flag on others.
        for p in (await db.execute(select(Plan).where(Plan.is_default.is_(True)))).scalars().all():
            p.is_default = False
    plan = Plan(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        is_default=payload.is_default,
        sort_order=payload.sort_order,
        price_vnd=payload.price_vnd,
        price_usd_cents=payload.price_usd_cents,
        is_active=payload.is_active,
        entitlements=payload.entitlements,
    )
    db.add(plan)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_plan", target_type="plan", target_id=plan.id,
        metadata={"code": plan.code},
    )
    await db.commit()
    await db.refresh(plan)
    return plan


@router.patch("/plans/{plan_id}", response_model=PlanOut)
async def update_plan(plan_id: uuid.UUID, payload: PlanUpdate, admin: SuperAdminUser, db: DbSession) -> Plan:
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise NotFound("plan")
    changes: dict = {}
    if payload.name is not None:
        plan.name = payload.name; changes["name"] = payload.name
    if payload.description is not None:
        plan.description = payload.description; changes["description"] = "updated"
    if payload.sort_order is not None:
        plan.sort_order = payload.sort_order; changes["sort_order"] = payload.sort_order
    if payload.is_default is not None:
        if payload.is_default:
            for p in (await db.execute(
                select(Plan).where(Plan.is_default.is_(True), Plan.id != plan.id)
            )).scalars().all():
                p.is_default = False
        plan.is_default = payload.is_default
        changes["is_default"] = payload.is_default
    if payload.price_vnd is not None:
        plan.price_vnd = payload.price_vnd; changes["price_vnd"] = payload.price_vnd
    if payload.price_usd_cents is not None:
        plan.price_usd_cents = payload.price_usd_cents
        changes["price_usd_cents"] = payload.price_usd_cents
    if payload.is_active is not None:
        plan.is_active = payload.is_active; changes["is_active"] = payload.is_active
    if payload.entitlements is not None:
        plan.entitlements = payload.entitlements
        changes["entitlements"] = "updated"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_plan", target_type="plan", target_id=plan.id,
        metadata=changes,
    )
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(plan_id: uuid.UUID, admin: SuperAdminUser, db: DbSession) -> None:
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise NotFound("plan")
    # FK on users.plan_id is ON DELETE SET NULL — affected users fall back to default plan.
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_plan", target_type="plan", target_id=plan.id,
        metadata={"code": plan.code},
    )
    await db.delete(plan)
    await db.commit()


# ============================================================================
# Billing — admin full CRUD
# ============================================================================


# Replaced with app.core.tenant.bulk_fetch_map — kept under the old name
# so the rest of the file (and any external import) keeps working.
_bulk_fetch_map = bulk_fetch_map


async def _subs_to_out(
    db, subs: list[Subscription],
) -> list[AdminSubscriptionOut]:
    user_ids = {s.user_id for s in subs if s.user_id}
    plan_ids = {s.plan_id for s in subs if s.plan_id}
    users = await _bulk_fetch_map(db, User, user_ids)
    plans = await _bulk_fetch_map(db, Plan, plan_ids)
    out: list[AdminSubscriptionOut] = []
    for sub in subs:
        u = users.get(sub.user_id)
        p = plans.get(sub.plan_id)
        out.append(AdminSubscriptionOut(
            id=sub.id,
            user_id=sub.user_id,
            user_email=u.email if u else "",
            plan_id=sub.plan_id,
            plan_code=p.code if p else "",
            plan_name=p.name if p else "",
            status=sub.status,
            billing_cycle=sub.billing_cycle,
            provider=sub.provider,
            amount=sub.amount,
            currency=sub.currency,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            cancelled_at=sub.cancelled_at,
            created_at=sub.created_at,
        ))
    return out


async def _pays_to_out(db, pays: list[Payment]) -> list[AdminPaymentOut]:
    user_ids = {p.user_id for p in pays if p.user_id}
    users = await _bulk_fetch_map(db, User, user_ids)
    return [
        AdminPaymentOut(
            id=p.id, user_id=p.user_id,
            user_email=users[p.user_id].email if p.user_id in users else "",
            subscription_id=p.subscription_id,
            amount=p.amount, currency=p.currency, status=p.status,
            provider=p.provider, provider_payment_id=p.provider_payment_id,
            payment_method=p.payment_method, paid_at=p.paid_at,
            failure_reason=p.failure_reason, created_at=p.created_at,
        )
        for p in pays
    ]


async def _sub_with_joins(db, sub: Subscription) -> AdminSubscriptionOut:
    user = await db.get(User, sub.user_id)
    plan = await db.get(Plan, sub.plan_id)
    return AdminSubscriptionOut(
        id=sub.id,
        user_id=sub.user_id,
        user_email=user.email if user else "",
        plan_id=sub.plan_id,
        plan_code=plan.code if plan else "",
        plan_name=plan.name if plan else "",
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        provider=sub.provider,
        amount=sub.amount,
        currency=sub.currency,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        cancelled_at=sub.cancelled_at,
        created_at=sub.created_at,
    )


async def _pay_with_email(db, pay: Payment) -> AdminPaymentOut:
    user = await db.get(User, pay.user_id)
    return AdminPaymentOut(
        id=pay.id,
        user_id=pay.user_id,
        user_email=user.email if user else "",
        subscription_id=pay.subscription_id,
        amount=pay.amount,
        currency=pay.currency,
        status=pay.status,
        provider=pay.provider,
        provider_payment_id=pay.provider_payment_id,
        payment_method=pay.payment_method,
        paid_at=pay.paid_at,
        failure_reason=pay.failure_reason,
        created_at=pay.created_at,
    )


async def _inv_with_email(db, inv: Invoice) -> AdminInvoiceOut:
    user = await db.get(User, inv.user_id)
    return AdminInvoiceOut(
        id=inv.id,
        user_id=inv.user_id,
        user_email=user.email if user else "",
        subscription_id=inv.subscription_id,
        payment_id=inv.payment_id,
        invoice_number=inv.invoice_number,
        amount=inv.amount,
        tax=inv.tax,
        total=inv.total,
        currency=inv.currency,
        status=inv.status,
        issued_at=inv.issued_at,
        paid_at=inv.paid_at,
        line_items=inv.line_items,
        billing_info=inv.billing_info,
        pdf_url=inv.pdf_url,
        created_at=inv.created_at,
    )


async def _invs_to_out(db, invs: list[Invoice]) -> list[AdminInvoiceOut]:
    user_ids = {i.user_id for i in invs if i.user_id}
    users = await _bulk_fetch_map(db, User, user_ids)
    return [
        AdminInvoiceOut(
            id=i.id, user_id=i.user_id,
            user_email=users[i.user_id].email if i.user_id in users else "",
            subscription_id=i.subscription_id, payment_id=i.payment_id,
            invoice_number=i.invoice_number,
            amount=i.amount, tax=i.tax, total=i.total,
            currency=i.currency, status=i.status,
            issued_at=i.issued_at, paid_at=i.paid_at,
            line_items=i.line_items, billing_info=i.billing_info,
            pdf_url=i.pdf_url, created_at=i.created_at,
        )
        for i in invs
    ]


# -- Subscriptions ---------------------------------------------------------

@router.get("/subscriptions", response_model=list[AdminSubscriptionOut])
async def list_subscriptions(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminSubscriptionOut]:
    q = _scope_to_admin_domain(select(Subscription), Subscription.user_id, admin)
    if status_filter:
        q = q.where(Subscription.status == status_filter)
    if user_id:
        q = q.where(Subscription.user_id == user_id)
    q = q.order_by(Subscription.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await _subs_to_out(db, rows)


@router.post("/subscriptions", response_model=AdminSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def create_subscription_admin(
    payload: AdminSubscriptionCreate, admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    """Admin creates a subscription directly (e.g. manual gift, comp, migrated user)."""
    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    await _assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    if not await db.get(Plan, payload.plan_id):
        raise NotFound("plan")
    sub = Subscription(
        user_id=payload.user_id, plan_id=payload.plan_id, status=payload.status,
        billing_cycle=payload.billing_cycle, provider=payload.provider,
        amount=payload.amount, currency=payload.currency,
        current_period_start=payload.current_period_start,
        current_period_end=payload.current_period_end,
    )
    db.add(sub)
    await db.flush()
    # If admin sets status=active, also push user.plan_id so entitlements reflect
    if payload.status == "active":
        user = await db.get(User, payload.user_id)
        if user:
            user.plan_id = payload.plan_id
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_subscription",
        target_type="subscription", target_id=sub.id,
        metadata={"user_id": str(payload.user_id), "plan_id": str(payload.plan_id)},
    )
    await db.commit()
    await db.refresh(sub)
    return await _sub_with_joins(db, sub)


@router.patch("/subscriptions/{subscription_id}", response_model=AdminSubscriptionOut)
async def update_subscription_admin(
    subscription_id: uuid.UUID, payload: AdminSubscriptionUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await _assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    changes: dict = {}
    plan_changed = False
    if payload.plan_id is not None:
        if not await db.get(Plan, payload.plan_id):
            raise NotFound("plan")
        sub.plan_id = payload.plan_id; changes["plan_id"] = str(payload.plan_id); plan_changed = True
    if payload.status is not None:
        sub.status = payload.status; changes["status"] = payload.status
    if payload.billing_cycle is not None:
        sub.billing_cycle = payload.billing_cycle; changes["billing_cycle"] = payload.billing_cycle
    if payload.provider is not None:
        sub.provider = payload.provider; changes["provider"] = payload.provider
    if payload.amount is not None:
        sub.amount = payload.amount; changes["amount"] = float(payload.amount)
    if payload.currency is not None:
        sub.currency = payload.currency
    if payload.current_period_start is not None:
        sub.current_period_start = payload.current_period_start
    if payload.current_period_end is not None:
        sub.current_period_end = payload.current_period_end
    if payload.cancel_at_period_end is not None:
        sub.cancel_at_period_end = payload.cancel_at_period_end
    # Mirror plan change to user.plan_id only when sub is active.
    if (plan_changed or payload.status == "active") and sub.status == "active":
        user = await db.get(User, sub.user_id)
        if user:
            user.plan_id = sub.plan_id
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_subscription",
        target_type="subscription", target_id=sub.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(sub)
    return await _sub_with_joins(db, sub)


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription_admin(
    subscription_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await _assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_subscription",
        target_type="subscription", target_id=sub.id,
    )
    await db.delete(sub)
    await db.commit()


@router.post("/subscriptions/{subscription_id}/confirm-payment", response_model=AdminSubscriptionOut)
async def confirm_payment(
    subscription_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> AdminSubscriptionOut:
    """Mark a pending subscription as paid → active.

    Side effects: payment→success, invoice→paid, user.plan_id updated, period set.
    """
    from app.modules.billing.service import period_end_for_cycle

    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise NotFound("subscription")
    await _assert_billing_owner_in_admin_domain(db, admin, sub.user_id)
    if sub.status != "pending":
        raise InvalidPayload(f"Subscription đang ở trạng thái {sub.status}, không phải pending")

    now = datetime.now(timezone.utc)
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = period_end_for_cycle(now, sub.billing_cycle)

    pay = (
        await db.execute(
            select(Payment).where(Payment.subscription_id == sub.id, Payment.status == "pending")
            .order_by(Payment.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if pay:
        pay.status = "success"
        pay.paid_at = now

    inv = (
        await db.execute(
            select(Invoice).where(Invoice.subscription_id == sub.id, Invoice.status == "draft")
            .order_by(Invoice.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if inv:
        inv.status = "paid"
        inv.paid_at = now

    user = await db.get(User, sub.user_id)
    if user:
        user.plan_id = sub.plan_id

    await audit.log_action(
        db, user_id=admin.id, action="admin_confirm_payment", target_type="subscription",
        target_id=sub.id, metadata={"user_id": str(sub.user_id), "amount": float(sub.amount)},
    )
    await db.commit()
    await db.refresh(sub)
    return await _sub_with_joins(db, sub)


# -- Payments --------------------------------------------------------------

@router.get("/payments", response_model=list[AdminPaymentOut])
async def list_payments(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminPaymentOut]:
    q = _scope_to_admin_domain(select(Payment), Payment.user_id, admin)
    if status_filter:
        q = q.where(Payment.status == status_filter)
    if user_id:
        q = q.where(Payment.user_id == user_id)
    q = q.order_by(Payment.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await _pays_to_out(db, rows)


@router.post("/payments", response_model=AdminPaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment_admin(
    payload: AdminPaymentCreate, admin: AdminUser, db: DbSession,
) -> AdminPaymentOut:
    """Manually record a payment (e.g. cash, bank transfer received offline)."""
    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    if payload.subscription_id and not await db.get(Subscription, payload.subscription_id):
        raise NotFound("subscription")
    await _assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    pay = Payment(
        user_id=payload.user_id, subscription_id=payload.subscription_id,
        amount=payload.amount, currency=payload.currency, status=payload.status,
        provider=payload.provider, provider_payment_id=payload.provider_payment_id,
        payment_method=payload.payment_method,
        paid_at=payload.paid_at or (datetime.now(timezone.utc) if payload.status == "success" else None),
        failure_reason=payload.failure_reason,
    )
    db.add(pay)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_payment",
        target_type="payment", target_id=pay.id,
        metadata={"user_id": str(payload.user_id), "amount": float(payload.amount)},
    )
    await db.commit()
    await db.refresh(pay)
    return await _pay_with_email(db, pay)


@router.patch("/payments/{payment_id}", response_model=AdminPaymentOut)
async def update_payment_admin(
    payment_id: uuid.UUID, payload: AdminPaymentUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminPaymentOut:
    pay = await db.get(Payment, payment_id)
    if not pay:
        raise NotFound("payment")
    await _assert_billing_owner_in_admin_domain(db, admin, pay.user_id)
    changes: dict = {}
    for field in ("amount", "status", "provider", "provider_payment_id",
                  "payment_method", "paid_at", "failure_reason"):
        value = getattr(payload, field)
        if value is not None:
            setattr(pay, field, value)
            changes[field] = float(value) if field == "amount" else (str(value) if value else None)
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_payment",
        target_type="payment", target_id=pay.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(pay)
    return await _pay_with_email(db, pay)


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_admin(
    payment_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    pay = await db.get(Payment, payment_id)
    if not pay:
        raise NotFound("payment")
    await _assert_billing_owner_in_admin_domain(db, admin, pay.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_payment",
        target_type="payment", target_id=pay.id,
    )
    await db.delete(pay)
    await db.commit()


# -- Invoices --------------------------------------------------------------

@router.get("/invoices", response_model=list[AdminInvoiceOut])
async def list_invoices(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminInvoiceOut]:
    q = _scope_to_admin_domain(select(Invoice), Invoice.user_id, admin)
    if status_filter:
        q = q.where(Invoice.status == status_filter)
    if user_id:
        q = q.where(Invoice.user_id == user_id)
    q = q.order_by(Invoice.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await _invs_to_out(db, rows)


@router.post("/invoices", response_model=AdminInvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice_admin(
    payload: AdminInvoiceCreate, admin: AdminUser, db: DbSession,
) -> AdminInvoiceOut:
    """Manually issue an invoice (e.g. for cash sales or post-hoc invoicing)."""
    from app.modules.billing.service import next_invoice_number

    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    await _assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    inv_no = await next_invoice_number(db)
    total = payload.amount + payload.tax
    now = datetime.now(timezone.utc)
    inv = Invoice(
        user_id=payload.user_id,
        subscription_id=payload.subscription_id,
        payment_id=payload.payment_id,
        invoice_number=inv_no,
        amount=payload.amount, tax=payload.tax, total=total,
        currency=payload.currency, status=payload.status,
        issued_at=now if payload.status != "draft" else None,
        paid_at=now if payload.status == "paid" else None,
        line_items=payload.line_items, billing_info=payload.billing_info,
    )
    db.add(inv)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_invoice",
        target_type="invoice", target_id=inv.id,
        metadata={"invoice_number": inv_no, "user_id": str(payload.user_id), "total": float(total)},
    )
    await db.commit()
    await db.refresh(inv)
    return await _inv_with_email(db, inv)


@router.patch("/invoices/{invoice_id}", response_model=AdminInvoiceOut)
async def update_invoice_admin(
    invoice_id: uuid.UUID, payload: AdminInvoiceUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminInvoiceOut:
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise NotFound("invoice")
    await _assert_billing_owner_in_admin_domain(db, admin, inv.user_id)
    changes: dict = {}
    if payload.amount is not None:
        inv.amount = payload.amount; changes["amount"] = float(payload.amount)
    if payload.tax is not None:
        inv.tax = payload.tax; changes["tax"] = float(payload.tax)
    if payload.amount is not None or payload.tax is not None:
        inv.total = inv.amount + inv.tax
    if payload.status is not None:
        inv.status = payload.status
        changes["status"] = payload.status
        if payload.status == "paid" and not inv.paid_at:
            inv.paid_at = datetime.now(timezone.utc)
        if payload.status == "issued" and not inv.issued_at:
            inv.issued_at = datetime.now(timezone.utc)
    if payload.paid_at is not None:
        inv.paid_at = payload.paid_at
    if payload.line_items is not None:
        inv.line_items = payload.line_items
    if payload.billing_info is not None:
        inv.billing_info = payload.billing_info
    if payload.pdf_url is not None:
        inv.pdf_url = payload.pdf_url
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_invoice",
        target_type="invoice", target_id=inv.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(inv)
    return await _inv_with_email(db, inv)


@router.delete("/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice_admin(
    invoice_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise NotFound("invoice")
    await _assert_billing_owner_in_admin_domain(db, admin, inv.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_invoice",
        target_type="invoice", target_id=inv.id,
        metadata={"invoice_number": inv.invoice_number},
    )
    await db.delete(inv)
    await db.commit()
