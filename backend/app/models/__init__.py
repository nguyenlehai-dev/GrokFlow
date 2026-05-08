import uuid
from datetime import datetime
from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# Cross-dialect: JSONB on Postgres, JSON on SQLite/others.
JSONType = JSONB().with_variant(JSON(), "sqlite")
UUIDType = Uuid(as_uuid=True)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    webhook_url: Mapped[str | None] = mapped_column(Text)
    webhook_secret: Mapped[str | None] = mapped_column(String(128))

    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    profiles: Mapped[list["Profile"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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


class Profile(Base, TimestampMixin):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    profile_path: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="created")
    encrypted_cookie: Mapped[str | None] = mapped_column(Text)
    encrypted_storage_state: Mapped[str | None] = mapped_column(Text)
    last_login_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    # Multi-tab support: each profile can run N jobs in parallel via separate
    # Chromium tabs. Counter is atomically incremented when worker claims a slot.
    active_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_concurrent_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    user: Mapped[User] = relationship(back_populates="profiles")
    jobs: Mapped[list["Job"]] = relationship(back_populates="profile")


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("api_keys.id", ondelete="SET NULL"))
    profile_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("profiles.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    input_payload: Mapped[dict | None] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retry: Mapped[int] = mapped_column(Integer, default=3)
    result_file_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType)
    result_url: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When set in the future, the worker skips this job until that time —
    # used to enforce retry backoff without blocking the worker loop.
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="jobs")
    profile: Mapped[Profile | None] = relationship(back_populates="jobs")
    logs: Mapped[list["JobLog"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobLog(Base):
    __tablename__ = "job_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    job_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    job: Mapped[Job] = relationship(back_populates="logs")


class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("jobs.id", ondelete="SET NULL"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    storage_driver: Mapped[str] = mapped_column(String(50), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    public_url: Mapped[str | None] = mapped_column(Text)
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


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


__all__ = ["User", "ApiKey", "Profile", "Job", "JobLog", "File", "AuditLog"]
