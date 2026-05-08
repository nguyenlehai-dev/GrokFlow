import secrets

from fastapi import APIRouter
from pydantic import BaseModel, Field, HttpUrl

from app.core.deps import CurrentUser, DbSession
from app.models import User
from app.modules.audit import service as audit

router = APIRouter(prefix="/api/settings", tags=["settings"])


class WebhookConfig(BaseModel):
    webhook_url: HttpUrl | None = None
    rotate_secret: bool = False


class WebhookOut(BaseModel):
    webhook_url: str | None
    has_secret: bool
    new_secret: str | None = Field(default=None, description="Returned only when rotated; store immediately.")


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.get("/webhook", response_model=WebhookOut)
async def get_webhook(user: CurrentUser) -> WebhookOut:
    return WebhookOut(webhook_url=user.webhook_url, has_secret=bool(user.webhook_secret))


@router.put("/webhook", response_model=WebhookOut)
async def set_webhook(payload: WebhookConfig, user: CurrentUser, db: DbSession) -> WebhookOut:
    user.webhook_url = str(payload.webhook_url) if payload.webhook_url else None
    new_secret: str | None = None
    if payload.rotate_secret or (user.webhook_url and not user.webhook_secret):
        new_secret = secrets.token_urlsafe(32)
        user.webhook_secret = new_secret
    if not user.webhook_url:
        user.webhook_secret = None
    await audit.log_action(db, user_id=user.id, action="set_webhook", target_type="user",
                           target_id=user.id, metadata={"url_set": bool(user.webhook_url),
                                                        "rotated": bool(new_secret)})
    await db.commit()
    return WebhookOut(webhook_url=user.webhook_url, has_secret=bool(user.webhook_secret),
                      new_secret=new_secret)


@router.post("/password")
async def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> dict:
    from app.core.exceptions import InvalidCredentials
    from app.core.security import hash_password, verify_password

    if not verify_password(payload.current_password, user.password_hash):
        raise InvalidCredentials()
    user.password_hash = hash_password(payload.new_password)
    await audit.log_action(db, user_id=user.id, action="change_password",
                           target_type="user", target_id=user.id)
    await db.commit()
    return {"ok": True}
