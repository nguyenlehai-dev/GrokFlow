import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
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


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Plan entitlements: { "features": { "job.video": true, ... },
    #                      "limits":   { "max_profiles": 3, ... } }
    entitlements: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Pricing (NULL = "Liên hệ" / not directly purchasable). All amounts in
    # *smallest unit*: VND has no subunit so price_vnd is the integer VND amount.
    # USD is stored in cents (e.g. 19900 = $199.00).
    price_vnd: Mapped[int | None] = mapped_column(BigInteger)
    price_usd_cents: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


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
    # Plan + per-user entitlement overrides. plan_id NULL → fall back to default plan.
    # entitlement_overrides is a partial map merged on top of the plan's entitlements.
    plan_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("plans.id", ondelete="SET NULL"))
    entitlement_overrides: Mapped[dict | None] = mapped_column(JSONType)

    plan: Mapped[Plan | None] = relationship()
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


class Subscription(Base, TimestampMixin):
    """A user's active subscription to a paid Plan.

    Lifecycle: pending → active → (cancelled | past_due | expired).
    `cancel_at_period_end` flags voluntary cancellation that takes effect when
    the current period ends — the user keeps access until then.
    """
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    billing_cycle: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship()
    plan: Mapped["Plan"] = relationship()


class Payment(Base, TimestampMixin):
    """A single payment attempt — success or failure.

    Always associated with a user; subscription_id is nullable to support
    one-time top-ups or admin-recorded offline payments.
    """
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), index=True)
    payment_method: Mapped[str | None] = mapped_column(String(50))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Full provider callback for debugging + audit
    raw_response: Mapped[dict | None] = mapped_column(JSONType)
    failure_reason: Mapped[str | None] = mapped_column(Text)


class Invoice(Base, TimestampMixin):
    """Accounting record. One invoice per payment cycle (or one-time charge).

    invoice_number is a unique human-friendly ID like INV-202611-0001.
    """
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("payments.id", ondelete="SET NULL")
    )
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="VND")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # [{description, amount, quantity}]
    line_items: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    # {name, email, company, tax_code, address, country}
    billing_info: Mapped[dict | None] = mapped_column(JSONType)
    pdf_url: Mapped[str | None] = mapped_column(Text)


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


__all__ = [
    "Plan",
    "User",
    "ApiKey",
    "Profile",
    "Job",
    "JobLog",
    "File",
    "AuditLog",
    "Subscription",
    "Payment",
    "Invoice",
    "Domain",
    "GitRepo",
]
