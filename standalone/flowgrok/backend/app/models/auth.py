"""Auth-related models — User, ApiKey."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    # Role tiers:
    #   super_admin — global super-admin (manages all domains, plans, users)
    #   admin       — per-domain admin (scoped to their domain_id)
    #   user        — regular user (scoped to their domain_id)
    #   support     — read-only support tier (legacy)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    # Domain membership. NULL = unscoped / super_admin (sees everything).
    # Non-super users created via /register at a domain get that domain's id;
    # admins-created users get the domain admin picks (or super_admin's own).
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="SET NULL"), index=True,
    )
    # Tool install scope — mirror of domain_id but for desktop kiosk users.
    # A user has EITHER domain_id OR tool_install_id, never both (enforced
    # at login time, not at DB level). Domain-scoped users can only log in
    # from the web; tool-scoped users only from that specific desktop install.
    tool_install_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("tool_installs.id", ondelete="SET NULL"), index=True,
    )
    webhook_url: Mapped[str | None] = mapped_column(Text)
    webhook_secret: Mapped[str | None] = mapped_column(String(128))
    # Plan + per-user entitlement overrides. plan_id NULL → fall back to default plan.
    # entitlement_overrides is a partial map merged on top of the plan's entitlements.
    plan_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("plans.id", ondelete="SET NULL"))
    entitlement_overrides: Mapped[dict | None] = mapped_column(JSONType)
    # Per-domain named role. Subset of allowed pages — narrows the user's
    # menu beyond what the domain itself grants. NULL = inherit domain pages.
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("roles.id", ondelete="SET NULL"), index=True,
    )
    # UI preferences. `locale` is the i18n choice (vi / en) — FE picks
    # default from browser if NULL on first login. `notification_prefs`
    # is a JSON blob of { event_key: { email: bool, in_app: bool } } so we
    # don't have to bump a column every time a new event type is added.
    locale: Mapped[str | None] = mapped_column(String(10))
    notification_prefs: Mapped[dict | None] = mapped_column(JSONType)

    plan: Mapped["Plan | None"] = relationship()  # noqa: F821
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    profiles: Mapped[list["Profile"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
    jobs: Mapped[list["Job"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821


class ApiKey(Base, TimestampMixin):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    allowed_providers: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    allowed_job_types: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60)
    daily_limit: Mapped[int] = mapped_column(Integer, default=1000)
    used_today: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="api_keys")
