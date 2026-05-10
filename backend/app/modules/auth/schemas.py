import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
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
    email: EmailStr
    full_name: str | None
    role: str
    status: str
    created_at: datetime
    entitlements: EntitlementsResponse
