"""Tool distribution — admin-managed downloadable installers + docs.

Distinct from the `tool` module (per-user prompt templates) and the
`tool_install` module (desktop kiosk registrations). This module is the
**file-distribution** layer: where the admin uploads .exe / .dmg / PDFs
for end-users to download, organised by product.

  Tool        — a product (Create Video Pro, Grok Helper, …)
                · 1 logo, 1 description, 1 homepage link
  ToolAsset   — a downloadable file attached to a Tool
                · kind ∈ {win, mac, document}
                · 1 latest per (tool, kind) gets the badge
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, TimestampMixin, UUIDType, _uuid


class Tool(Base, TimestampMixin):
    """A distributable product. Has metadata shared across all its release
    files (logo, description, homepage). Releases live in `ToolAsset`."""
    __tablename__ = "tools"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    # URL-safe slug — used as the public identifier (e.g. "cvp",
    # "grok-helper"). Unique so two tools can't accidentally collide.
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    # Human display name — appears on cards and inside the desktop tool's
    # own About screen if it self-reports this.
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Logo lives in the existing files table — admin uploads it once and
    # FE renders by hitting /api/files/{id}/download. NULL = no logo, FE
    # shows a placeholder.
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("files.id", ondelete="SET NULL"), nullable=True,
    )
    # Marketing / docs link shown on the public download page.
    homepage_url: Mapped[str | None] = mapped_column(String(500))
    # Sort order in admin lists (lower = first). Defaults to 0 so newly
    # created tools land at the top until admin re-orders.
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )


class ToolAsset(Base, TimestampMixin):
    """A downloadable file attached to a Tool.

    `kind` decides which workspace page lists this asset (win / mac /
    document). `is_latest` flags the one to highlight per (tool, kind);
    the admin UI enforces at most one latest per bucket. `file_id`
    references the existing `files` table for the actual blob storage."""
    __tablename__ = "tool_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    tool_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("tools.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # Free-text but only 3 values used today: "win" / "mac" / "document".
    # Stored as VARCHAR rather than enum so adding "linux" / "android" is
    # zero-migration when we need to.
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # Display label — "Create Video Pro v1.2.0 — Setup (x64)" etc.
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Semver-ish string. Free-form so we can carry weird vendor variants
    # ("1.2.0-beta3", "2024.05") without parsing.
    version: Mapped[str | None] = mapped_column(String(50))
    # Required — every asset must point at a stored blob.
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("files.id", ondelete="RESTRICT"), nullable=False,
    )
    # Exactly one latest per (tool, kind) is enforced in the service layer
    # (clearing other rows' flag on set). The DB doesn't enforce this so
    # the admin can have a transient state of zero (e.g. after deleting
    # the latest but before promoting another).
    is_latest: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    # Optional release notes / changelog excerpt. Markdown.
    notes: Mapped[str | None] = mapped_column(Text)
    # Bumped on each /download hit so admin can see which version end-users
    # actually grab. Lossy (no per-user dedup) — good enough for trends.
    download_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
