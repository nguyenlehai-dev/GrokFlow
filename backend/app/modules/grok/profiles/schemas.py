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


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    provider: str = Field(pattern="^(grok|flow|other)$")
    max_concurrent_jobs: int = Field(default=1, ge=1, le=16)


class ProfileUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    max_concurrent_jobs: int | None = Field(default=None, ge=1, le=16)


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
    created_at: datetime

    class Config:
        from_attributes = True


class OpenBrowserResponse(BaseModel):
    profile_id: uuid.UUID
    status: str
    message: str
