"""Tool module models — prompt templates + chat sessions.

Tables created in alembic 0030. Owned by the new "Tool" frontend module
(super_admin's GROK VIP TOOL dashboard).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, JSONType, UUIDType, _uuid


class PromptTemplate(Base):
    """Reusable prompt — three-tier scope so super_admin can ship system
    presets while letting tenants and individual users keep their own.

      user_id IS NULL  + domain_id IS NULL  → system template (everyone sees)
      user_id IS NULL  + domain_id IS SET   → tenant template
      user_id IS SET                        → personal template
    """
    __tablename__ = "prompt_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="text", server_default="text")
    tags: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, onupdate=func.now(),
    )


class ChatSession(Base):
    """ChatGPT-style multi-turn conversation. Per-user only.

    `messages` is the entire transcript as a JSONB array — pulled in one
    request when the user reopens a session. Each entry:
      { "role": "user|assistant|system", "content": "...", "ts": "ISO" }
    """
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(
        String(200), nullable=False, default="New chat", server_default="New chat",
    )
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    messages: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    total_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, onupdate=func.now(),
    )
