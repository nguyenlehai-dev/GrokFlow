import secrets

from fastapi import APIRouter
from pydantic import BaseModel, Field, HttpUrl

from app.core.deps import CurrentUser, DbSession
from app.models import User
from app.modules.admin.audit import service as audit

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


# ─── i18n locale preference ─────────────────────────────────────────────
class LocaleConfig(BaseModel):
    locale: str = Field(min_length=2, max_length=10, description="vi | en")


class LocaleOut(BaseModel):
    locale: str | None


@router.get("/locale", response_model=LocaleOut)
async def get_locale(user: CurrentUser) -> LocaleOut:
    return LocaleOut(locale=user.locale)


@router.put("/locale", response_model=LocaleOut)
async def set_locale(payload: LocaleConfig, user: CurrentUser, db: DbSession) -> LocaleOut:
    # No allowlist server-side — the FE only offers vi/en today, but a future
    # 3rd language doesn't require a BE change. Length-bounded to avoid abuse.
    user.locale = payload.locale
    await audit.log_action(
        db, user_id=user.id, action="set_locale",
        target_type="user", target_id=user.id,
        metadata={"locale": payload.locale},
    )
    await db.commit()
    return LocaleOut(locale=user.locale)


# ─── Notification preferences ───────────────────────────────────────────
# Stored as a JSON map { event_key: { email: bool, in_app: bool } } so adding
# a new event type is a 1-line config change, no migration.
DEFAULT_NOTIFICATION_PREFS: dict[str, dict[str, bool]] = {
    "job_completed":      {"email": False, "in_app": True},
    "job_failed":         {"email": True,  "in_app": True},
    "billing_due":        {"email": True,  "in_app": True},
    "domain_assignment":  {"email": False, "in_app": True},
    "profile_login_needed": {"email": True, "in_app": True},
    "flow_completed":     {"email": False, "in_app": True},
    "system_announcement": {"email": True, "in_app": True},
}


class NotificationPrefsOut(BaseModel):
    prefs: dict[str, dict[str, bool]]


class NotificationPrefsUpdate(BaseModel):
    prefs: dict[str, dict[str, bool]]


@router.get("/notifications", response_model=NotificationPrefsOut)
async def get_notification_prefs(user: CurrentUser) -> NotificationPrefsOut:
    # Merge stored prefs over defaults so newly-added event types appear
    # with sensible defaults without the user having to re-save.
    stored = user.notification_prefs or {}
    merged = {**DEFAULT_NOTIFICATION_PREFS, **stored}
    return NotificationPrefsOut(prefs=merged)


@router.put("/notifications", response_model=NotificationPrefsOut)
async def set_notification_prefs(
    payload: NotificationPrefsUpdate, user: CurrentUser, db: DbSession,
) -> NotificationPrefsOut:
    # Drop unknown event keys — keeps the JSON column tidy + prevents abuse.
    cleaned = {
        k: {"email": bool(v.get("email", False)), "in_app": bool(v.get("in_app", True))}
        for k, v in payload.prefs.items()
        if k in DEFAULT_NOTIFICATION_PREFS
    }
    user.notification_prefs = cleaned
    await audit.log_action(
        db, user_id=user.id, action="set_notification_prefs",
        target_type="user", target_id=user.id,
        metadata={"keys": sorted(cleaned.keys())},
    )
    await db.commit()
    merged = {**DEFAULT_NOTIFICATION_PREFS, **cleaned}
    return NotificationPrefsOut(prefs=merged)
