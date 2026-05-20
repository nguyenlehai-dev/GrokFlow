"""Shared SQLAlchemy infrastructure for model files.

`Base` is the declarative base from `app.core.database`; every model
file imports it from here so all tables register against the same
metadata. The cross-dialect JSON column type and the standard
`TimestampMixin` also live here to avoid copy-pasting them per file.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

__all__ = ["Base", "JSONType", "UUIDType", "TimestampMixin", "_uuid"]


# Cross-dialect: JSONB on Postgres, JSON on SQLite/others.
JSONType = JSONB().with_variant(JSON(), "sqlite")
UUIDType = Uuid(as_uuid=True)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
