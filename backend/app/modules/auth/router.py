from fastapi import APIRouter
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import InvalidCredentials
from app.core.security import create_access_token, verify_password
from app.models import User
from app.modules.audit import service as audit

from .schemas import LoginRequest, TokenResponse, UserResponse

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


@router.post("/logout")
async def logout() -> dict:
    # Stateless JWT — client just drops the token. Endpoint kept for API parity.
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> User:
    return user
