from fastapi import APIRouter, Header
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import EmailAlreadyRegistered, InvalidCredentials
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Domain, Plan, User
from app.modules.audit import service as audit
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
async def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise InvalidCredentials()
    if user.status != "active":
        raise InvalidCredentials()
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
async def me(user: CurrentUser, db: DbSession) -> MeResponse:
    eff = await get_effective_entitlements(db, user)
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        domain_id=user.domain_id,
        entitlements=EntitlementsResponse(**eff),
    )
