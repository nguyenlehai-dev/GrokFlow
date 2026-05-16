"""Admin / tenant models — Domain, Role, AuditLog, Notification, GitRepo."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


class Domain(Base, TimestampMixin):
    """Per-domain access control config.

    Each domain row says: when the frontend is loaded via hostname X,
    what pages are accessible and what public flows (landing/register)
    are exposed. Resolution: backend looks up by `hostname` (lower-cased).
    Falls back to a row with hostname='*' (the default config) if no
    exact match is found.
    """
    __tablename__ = "domains"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    hostname: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    # Public-area flags
    allow_landing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    allow_register: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    allow_login: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Authed-area route allowlist. Set allow_all_pages=true for unrestricted.
    allow_all_pages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # List of route paths (e.g. ["/dashboard", "/jobs", "/api-keys"]). Empty = none.
    allowed_pages: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    # Optional override: custom brand name shown in this domain's UI
    brand_name: Mapped[str | None] = mapped_column(String(100))
    # Whether the Grok Playground on this domain requires a verified API key
    # (per-domain gate — super_admin can disable it for trusted/internal domains).
    require_playground_key: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # Per-domain maintenance window. When ON, every non-admin user landing
    # on this hostname sees a friendly maintenance screen instead of the
    # normal UI. Admin / super_admin still get through so they can fix.
    # Lets the team patch one tenant in isolation without blanket downtime.
    maintenance_mode: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    maintenance_message: Mapped[str | None] = mapped_column(Text)
    # When non-null and in the future, the frontend shows a marquee banner
    # with a countdown ("Bảo trì trong 5:00") and the announcement text;
    # once `now` passes this timestamp, the frontend treats the domain as
    # if maintenance_mode were true (auto-activates without admin clicking
    # again). When the patch is done, admin clears the timestamp.
    maintenance_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    maintenance_announcement: Mapped[str | None] = mapped_column(Text)
    # Per-domain login UI variant — "default" (branded marketing-style
    # split layout) or "admin" (minimal console layout). The /admin/login
    # URL always forces "admin" regardless of this setting.
    login_template: Mapped[str] = mapped_column(
        String(50), nullable=False, default="default", server_default="default"
    )


class Role(Base, TimestampMixin):
    """A named permission set within a domain.

    Each role is scoped to exactly one domain and lists a subset of that
    domain's allowed_pages. A user with `role_id` set sees the intersection
    of `role.allowed_pages` and `domain.allowed_pages`. A user without a
    role inherits the full domain page list (legacy behavior).
    """
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    domain_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    allowed_pages: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(100))
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType)
    ip_address: Mapped[str | None] = mapped_column(String(100))
    user_agent: Mapped[str | None] = mapped_column(Text)
    audit_metadata: Mapped[dict | None] = mapped_column("metadata", JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Notification(Base, TimestampMixin):
    """In-app notification queue.

    The bell icon in the FE header polls `GET /api/notifications?unread=1`
    every 15s and renders a dropdown. `kind` is a free-text event key
    (job_completed / job_failed / billing_due / domain_assignment / …)
    so adding a new event type is a 1-line backend change, no migration.

    `target_url` is the FE route the user should land on when they click
    the row — e.g. `/grok/jobs/<id>` after a job_completed. Leaving it
    NULL just shows the notification without a click affordance.
    """
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    target_url: Mapped[str | None] = mapped_column(String(500))
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class GitRepo(Base, TimestampMixin):
    """A git repo deployed to this host that admin can monitor + redeploy.

    Each repo gets its own tab in /admin/git. Self-deployments work because
    backend SSHs to the host as a privileged user and runs git + docker
    compose commands inside the repo's local_path.

    `services` is the list of compose service names to rebuild on Deploy.
    Empty list means "rebuild whatever docker compose up touches" — no -f
    filter applied.
    """
    __tablename__ = "git_repos"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    github_repo: Mapped[str] = mapped_column(String(255), nullable=False)  # "owner/repo"
    branch: Mapped[str] = mapped_column(String(100), nullable=False, default="main")
    local_path: Mapped[str] = mapped_column(Text, nullable=False)
    compose_file: Mapped[str | None] = mapped_column(String(255))
    env_file: Mapped[str | None] = mapped_column(String(255))
    services: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
