"""Flow module models — FlowJob (video processing)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


class FlowJob(Base, TimestampMixin):
    """Video-processing job (Flow module). Owns its own table because the
    work-unit shape is very different from the Grok automation `jobs` row
    (no profile / api-key linkage, but with input/output file metadata
    and ffmpeg-specific status values).
    """
    __tablename__ = "flow_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    # Tool slug — cut / merge / extract-audio / add-audio / speed / resize / crop / extract-frames.
    operation: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # uploading | pending | processing | completed | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="uploading", index=True)
    progress: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    # Tool-specific params (start_time, speed, width, etc).
    params: Mapped[dict | None] = mapped_column(JSONType)
    # List of {filename, object_key} — relative path under storage/flow/input.
    input_files: Mapped[list | None] = mapped_column(JSONType)
    # Public-ish download URL (rewritten in /flow-output/ by nginx).
    output_url: Mapped[str | None] = mapped_column(Text)
    output_filename: Mapped[str | None] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    duration: Mapped[float | None] = mapped_column(Numeric(10, 3))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
