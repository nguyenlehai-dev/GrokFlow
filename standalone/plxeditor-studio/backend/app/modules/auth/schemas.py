import uuid
from datetime import datetime
from pydantic import BaseModel, Field

from app.core.types import PermissiveEmail


class LoginRequest(BaseModel):
    email: PermissiveEmail
    password: str


class RegisterRequest(BaseModel):
    email: PermissiveEmail
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str  # plain str on output — don't re-validate stored emails
    full_name: str | None
    role: str
    status: str
    created_at: datetime


class EntitlementsResponse(BaseModel):
    plan_code: str | None
    plan_name: str | None
    # Subscription state echoed from `resolve_user_plan_with_status`.
    # The FE shows a "renew now" banner when this is past_due / expired.
    #   active        — subscription paid and current
    #   pending       — admin created sub, awaiting payment confirmation
    #   past_due      — last payment failed; grace window before downgrade
    #   expired       — period ended; user has been auto-downgraded to default plan
    #   cancelled     — user cancelled; still active until period end (sub.cancel_at_period_end)
    #   none          — no subscription record (free / admin / legacy)
    subscription_status: str = "none"
    features: dict[str, bool]
    limits: dict[str, int]


class MeResponse(BaseModel):
    """Combined response from /api/auth/me — user identity + effective entitlements."""
    id: uuid.UUID
    email: str  # plain str on output
    full_name: str | None
    role: str
    status: str
    created_at: datetime
    # Tenant membership. NULL = unscoped (super_admin or legacy).
    domain_id: uuid.UUID | None = None
    # Tool install scope. Non-null = this user is a desktop kiosk user.
    # FE uses this to skip the admin shell + auto-redirect to the
    # branded /create-video-pro workspace on login.
    tool_install_id: uuid.UUID | None = None
    # Per-domain role (Role row, not the role string above). When set the
    # user's menu is further narrowed to role.allowed_pages.
    role_id: uuid.UUID | None = None
    role_name: str | None = None
    # Effective allowed pages = role.allowed_pages ∩ domain.allowed_pages
    # (or domain.allowed_pages alone when role_id is null). The FE uses this
    # in place of domain.allowed_pages whenever the user is logged in, so
    # menu visibility narrows per-user.
    effective_allowed_pages: list[str] | None = None
    entitlements: EntitlementsResponse
    # UI preferences. FE bootstraps i18next + notification bell on these.
    locale: str | None = None
    notification_prefs: dict | None = None
