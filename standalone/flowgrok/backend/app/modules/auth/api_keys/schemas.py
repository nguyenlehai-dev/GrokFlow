import uuid
from datetime import datetime
from pydantic import BaseModel, Field


PROVIDERS = ["grok", "flow"]
JOB_TYPES = ["image", "video"]


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    allowed_providers: list[str] = Field(default_factory=list)
    allowed_job_types: list[str] = Field(default_factory=list)
    daily_limit: int = Field(default=1000, ge=1, le=1000000)
    rate_limit_per_minute: int = Field(default=60, ge=1, le=10000)
    expires_at: datetime | None = None


class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    status: str
    allowed_providers: list[str]
    allowed_job_types: list[str]
    rate_limit_per_minute: int
    daily_limit: int
    used_today: int
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreatedOut(ApiKeyOut):
    api_key: str
    warning: str = "Key chỉ hiển thị một lần. Hãy copy và lưu lại an toàn."
