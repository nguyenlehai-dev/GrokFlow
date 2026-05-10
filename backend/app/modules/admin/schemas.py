import uuid
from datetime import datetime
from pydantic import BaseModel, Field

from app.core.types import PermissiveEmail


class AdminUserCreate(BaseModel):
    email: PermissiveEmail
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    role: str = Field(default="user", pattern="^(admin|user|support)$")
    plan_id: uuid.UUID | None = None


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = Field(default=None, pattern="^(admin|user|support)$")
    status: str | None = Field(default=None, pattern="^(active|inactive|banned|pending)$")
    password: str | None = Field(default=None, min_length=8, max_length=128)
    plan_id: uuid.UUID | None = None
    # Partial overrides merged on top of the plan's entitlements.
    # Send {} to clear all overrides; omit to leave unchanged.
    entitlement_overrides: dict | None = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: PermissiveEmail
    full_name: str | None
    role: str
    status: str
    created_at: datetime
    plan_id: uuid.UUID | None = None
    entitlement_overrides: dict | None = None

    class Config:
        from_attributes = True


# ---------- Plans ----------


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern="^[a-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    is_default: bool = False
    sort_order: int = 0
    entitlements: dict = Field(
        default_factory=lambda: {"features": {}, "limits": {}},
        description="{features: {key: bool}, limits: {key: int}}",
    )


class PlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    sort_order: int | None = None
    entitlements: dict | None = None


class PlanOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_default: bool
    sort_order: int
    entitlements: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EntitlementCatalogOut(BaseModel):
    """Frontend uses this to render the toggle/limit editor."""
    features: dict[str, str]
    limits: dict[str, str]


class EffectiveEntitlementsOut(BaseModel):
    plan_code: str | None
    plan_name: str | None
    features: dict[str, bool]
    limits: dict[str, int]


class AdminStats(BaseModel):
    total_users: int
    total_api_keys: int
    total_profiles: int
    total_jobs: int
    jobs_24h_success: int
    jobs_24h_failed: int
