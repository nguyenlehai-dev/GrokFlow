"""ToolInstall — one row per desktop-app installation."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, JSONType, UUIDType, _uuid


class ToolInstall(Base):
    """Created when the desktop client POSTs /api/tool-installs/register on
    first launch. Stays alive forever; status flips between
    pending → active → disabled at admin discretion.

    Permission model mirrors `Domain` (allow_all_pages + allowed_pages list)
    so the existing visibility resolver in `useDomainStore` /
    `userCanSeePath` can be reused with minimal branching — the auth
    middleware just substitutes ToolInstall.allowed_pages for
    Domain.allowed_pages when a request bears the X-Tool-Install-Id header.
    """
    __tablename__ = "tool_installs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    tool_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    machine_name: Mapped[str | None] = mapped_column(String(255))
    public_ip: Mapped[str | None] = mapped_column(String(64))
    label: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", server_default="pending")
    allow_all_pages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    allowed_pages: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    brand_name: Mapped[str | None] = mapped_column(String(100))
    # Public-area flags (mirror Domain). Kiosk defaults: hide landing + register,
    # only show login. Admin can flip per-install.
    allow_landing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    allow_register: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    allow_login: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Which login screen variant the desktop shows on launch. "default" = the
    # marketing/customer-facing template, "admin" = Admin Console style.
    # Kiosk default is "admin" — first-launch should land directly on the
    # login form without the public landing/register chrome. Admins can
    # flip to "default" per-install if they want the public-facing variant.
    login_template: Mapped[str] = mapped_column(String(50), nullable=False, default="admin", server_default="admin")
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    client_version: Mapped[str | None] = mapped_column(String(50))
    # Per-install daily job quota — when set, overrides the parent domain's
    # quota for this specific machine. NULL = inherit from domain.
    jobs_quota_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Per-install reset hour (UTC, 0-23). When set differently from the
    # domain's, the install's value wins (mirrors how the quota itself
    # overrides). Default 0 = midnight UTC.
    quota_reset_hour_utc: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, onupdate=func.now(),
    )


class ToolInstallQuotaPeriod(Base):
    """Per-(install, date) counter for the daily jobs quota.

    Mirror of `DomainQuotaPeriod` but keyed by tool_install_id. Allows a
    reseller (one domain) to sell different daily caps to different
    desktop machines without the counters bleeding into each other.
    Counter row is materialised on the first submit of the day via
    INSERT … ON CONFLICT DO UPDATE.
    """
    __tablename__ = "tool_install_quota_periods"

    tool_install_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("tool_installs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    period_date: Mapped[date] = mapped_column(Date, primary_key=True)
    jobs_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
