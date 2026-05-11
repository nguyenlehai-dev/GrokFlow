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
    entitlements: EntitlementsResponse
