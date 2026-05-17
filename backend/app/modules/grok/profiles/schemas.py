import uuid
from datetime import datetime
from pydantic import BaseModel, Field

PROVIDERS = ["grok", "flow"]
PROFILE_STATUSES = [
    "created",
    "opening",
    "logged_in",
    "need_login",
    "expired",
    "blocked",
    "running_job",
    "disabled",
]


# Profile tier labels — free-text per the schema; this list is just what
# the UI offers in its dropdown. Add 'pro' etc. without a migration.
PROFILE_TIERS = ["free", "heavy", "pro"]


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    provider: str = Field(pattern="^(grok|flow|other)$")
    max_concurrent_jobs: int = Field(default=1, ge=1, le=16)
    # Video uses Playwright DOM — cap separately. 4 is empirically the
    # sweet spot before Chromium starts crashing tabs on heavy video pages.
    max_concurrent_video: int = Field(default=4, ge=1, le=12)
    # Image-only toggle. Default True keeps the historical "accepts both
    # image and video" behavior so existing FE forms that don't send this
    # field still produce video-capable profiles.
    allows_video: bool = True
    # Tier label (free / heavy / pro / etc.) — purely cosmetic, used for
    # the profile-list badge + filter. Doesn't change worker routing.
    tier: str = Field(default="free", max_length=20)


class ProfileUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    max_concurrent_jobs: int | None = Field(default=None, ge=1, le=16)
    max_concurrent_video: int | None = Field(default=None, ge=1, le=12)
    allows_video: bool | None = None
    tier: str | None = Field(default=None, max_length=20)


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    status: str
    last_login_check_at: datetime | None
    last_used_at: datetime | None
    error_message: str | None
    active_jobs: int = 0
    max_concurrent_jobs: int = 1
    active_video_jobs: int = 0
    max_concurrent_video: int = 4
    allows_video: bool = True
    tier: str = "free"
    created_at: datetime

    class Config:
        from_attributes = True


class OpenBrowserResponse(BaseModel):
    profile_id: uuid.UUID
    status: str
    message: str
