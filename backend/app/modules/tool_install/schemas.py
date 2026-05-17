"""Pydantic schemas for /api/tool-installs/* and /api/admin/auth/tool-installs/*."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


# ─── Public (desktop client) ────────────────────────────────────────────────


class RegisterIn(BaseModel):
    """Desktop client posts this on every boot. Server upserts on
    `tool_id` so re-registering is idempotent."""
    tool_id: str = Field(min_length=8, max_length=64)
    machine_name: str | None = Field(default=None, max_length=255)
    client_version: str | None = Field(default=None, max_length=50)


class HeartbeatIn(BaseModel):
    """Sent every ~5 min while app is open. Just bumps last_seen_at."""
    tool_id: str = Field(min_length=8, max_length=64)
    client_version: str | None = Field(default=None, max_length=50)


class InstallConfigOut(BaseModel):
    """What the desktop client gets back after register / on /me poll.
    The client uses `status` to decide whether to show the login screen
    ("active") or a "waiting for admin approval" screen ("pending")."""
    tool_id: str
    status: Literal["pending", "active", "disabled"]
    label: str | None
    brand_name: str | None
    allow_all_pages: bool
    allowed_pages: list[str]
    allow_landing: bool
    allow_login: bool
    allow_register: bool
    login_template: str
    assigned_user_email: str | None  # If admin pinned an account, FE pre-fills


# ─── Admin views ────────────────────────────────────────────────────────────


class ToolInstallAdminOut(BaseModel):
    id: uuid.UUID
    tool_id: str
    machine_name: str | None
    public_ip: str | None
    label: str | None
    description: str | None
    status: str
    allow_all_pages: bool
    allowed_pages: list[str]
    allow_landing: bool
    allow_login: bool
    allow_register: bool
    login_template: str
    brand_name: str | None
    assigned_user_id: uuid.UUID | None
    assigned_user_email: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    client_version: str | None
    # Per-install daily Grok job quota. NULL = inherit from parent domain.
    jobs_quota_per_day: int | None = None
    # UTC hour 0-23 the quota rolls over. Default 0 = midnight UTC.
    quota_reset_hour_utc: int = 0
    created_at: datetime
    updated_at: datetime


class ToolInstallUpdate(BaseModel):
    """Admin-controlled fields. `tool_id`, `machine_name`, `public_ip`,
    heartbeat timestamps are read-only — they come from the desktop."""
    label: str | None = Field(default=None, max_length=255)
    description: str | None = None
    status: Literal["pending", "active", "disabled"] | None = None
    allow_all_pages: bool | None = None
    allowed_pages: list[str] | None = None
    allow_landing: bool | None = None
    allow_login: bool | None = None
    allow_register: bool | None = None
    login_template: Literal["default", "admin"] | None = None
    brand_name: str | None = Field(default=None, max_length=100)
    assigned_user_id: uuid.UUID | None = None
    jobs_quota_per_day: int | None = Field(default=None, ge=0)
    quota_reset_hour_utc: int | None = Field(default=None, ge=0, le=23)


class ProvisionUserIn(BaseModel):
    """Create a tool-scoped user and (optionally) pin to this install.
    The created user has user.tool_install_id = install.id and no
    domain_id, so they can ONLY log in from this install."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    plan_id: uuid.UUID | None = None
    # If true, also set install.assigned_user_id = new user → only this
    # email can ever log in here (single-user kiosk mode).
    pin_as_only_user: bool = False


class ProvisionedUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    tool_install_id: uuid.UUID
