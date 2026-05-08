import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    role: str = Field(default="user", pattern="^(admin|user|support)$")


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = Field(default=None, pattern="^(admin|user|support)$")
    status: str | None = Field(default=None, pattern="^(active|inactive|banned|pending)$")
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminStats(BaseModel):
    total_users: int
    total_api_keys: int
    total_profiles: int
    total_jobs: int
    jobs_24h_success: int
    jobs_24h_failed: int
