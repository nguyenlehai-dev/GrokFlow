"""PromptHistory — per-user recent prompts, synced to server.

Replaces the localStorage-only history that leaked between accounts on
the same machine. Each (user_id, prompt) is unique so re-submitting the
same prompt updates the existing row instead of duplicating. Application
caps the list per user via a trim-on-insert routine in the endpoint.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, UUIDType, _uuid


class PromptHistory(Base):
    __tablename__ = "prompt_history"
    __table_args__ = (
        UniqueConstraint("user_id", "prompt", name="uq_prompt_history_user_prompt"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
