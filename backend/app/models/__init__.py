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
    # Image jobs go through the lightweight HTTP API path, so they scale
    # with `max_concurrent_jobs` (one tab per slot is fine).
    # Video jobs still drive Playwright DOM heavily — opening more than
    # ~4 video tabs in the same Chromium reliably crashes it
    # (TargetClosedError). Cap them separately so admins can leave
    # `max_concurrent_jobs` at 12 for image throughput without melting
    # the browser on video. Default 4 mirrors what works empirically.
    max_concurrent_video: Mapped[int] = mapped_column(Integer, nullable=False, default=4, server_default="4")
    # Subset of `active_jobs` that is video. We need this as a separate
    # counter so the slot-acquire UPDATE can enforce both caps atomically
    # without re-querying running jobs.
    active_video_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    user: Mapped[User] = relationship(back_populates="profiles")
    jobs: Mapped[list["Job"]] = relationship(back_populates="profile")


class GrokProject(Base, TimestampMixin):
    """A 'project' inside a single Grok account (= one Profile).

    Grok's web UI lets you keep chat history / presets / brand voice
    separated by project. We mirror that as a row here: one Profile
    (browser session) can hold N projects. Each project gets assigned to
    specific tenant domain(s) via ProjectDomainAssignment, so the same
    Profile can serve multiple customers without their data bleeding
    into each other's workspace.

    Identification:
      - `grok_project_id` = the slug Grok uses in its URL
        (https://grok.com/project/<slug>). Worker navigates here before
        each prompt submit.
      - `name` is the human label super_admin sets in our UI.
    """
    __tablename__ = "grok_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    grok_project_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class ProjectUserAssignment(Base):
    """Per-user assignment of a GrokProject.

    Lets super_admin pin a specific tenant user to a specific project so
    each customer gets their own chat history/preset even when sharing a
    Grok account with other tenants in the same domain. Takes priority
    over the domain-level assignment when both exist.
    """
    __tablename__ = "project_user_assignments"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("grok_projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class ProjectDomainAssignment(Base):
    """Many-to-many: which GrokProject each customer domain can pull from.

    Replaces the old ProfileDomainAssignment — granularity moved one level
    down so a single Grok account can serve multiple tenants in parallel
    via separate projects. Migration 0020 drops the legacy table.

    Per-user pinning is in ProjectUserAssignment and takes priority over
    this domain-wide rule when both apply.

    Only `super_admin` edits these. Per-domain `admin` can read their
    own set; `user` doesn't see this surface.
    """
    __tablename__ = "project_domain_assignments"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("grok_projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("api_keys.id", ondelete="SET NULL"))
    profile_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("profiles.id", ondelete="SET NULL"))
    # When the auto-pick scoped to a project assignment, we record it here
    # so the worker can navigate to grok.com/project/<grok_project_id>
    # before submitting the prompt. NULL for legacy jobs / non-project runs.
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("grok_projects.id", ondelete="SET NULL"), index=True,
    )
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


# ============================================================================
# LLM Gateway Management
# ============================================================================
# Inspired by gateway.plxeditor.com — admin manages Vendors (Google, OpenAI...),
# Pools (a group of API keys for a specific model + function), API Functions
# (Image Generation, Text Generation...), and Gateway Keys (issued to external
# clients). Requests log every execute call for observability.


class GwVendor(Base, TimestampMixin):
    """An upstream LLM provider — Google, OpenAI, Anthropic, etc."""
    __tablename__ = "gw_vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(50))
    domain: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class GwApiFunction(Base, TimestampMixin):
    """A semantic capability exposed by the gateway — Image Generation,
    Text Generation, Video Generation, etc. Clients pick a function code
    and the gateway routes to a matching pool.
    """
    __tablename__ = "gw_api_functions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    function_type: Mapped[str] = mapped_column(String(50), nullable=False, default="image")
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Free-form schema describing the function's expected input fields.
    request_schema: Mapped[dict | None] = mapped_column(JSONType)


class GwPool(Base, TimestampMixin):
    """A pool of API keys for a specific (vendor, function, model) combo.
    Gateway rotates through pool keys for load balancing + quota recovery.
    """
    __tablename__ = "gw_pools"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("gw_vendors.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    function_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("gw_api_functions.id", ondelete="SET NULL"), index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Seconds a key sits on cooldown after a 429 from this pool's vendor.
    # Defaults to 5 min — tune per-pool depending on the vendor's quota
    # window (Google's per-minute vs OpenAI's per-hour, etc).
    cooldown_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=300, server_default="300",
    )
    # Pricing per million tokens, in USD cents. Used to compute cost_cents
    # on each GwRequest once the upstream returns usage stats. 0 = free
    # / unknown — request still logs but cost stays NULL.
    cost_per_million_input_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    cost_per_million_output_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )

    vendor: Mapped["GwVendor"] = relationship()
    function: Mapped["GwApiFunction | None"] = relationship()
    keys: Mapped[list["GwPoolApiKey"]] = relationship(
        back_populates="pool", cascade="all, delete-orphan",
    )


class GwPoolApiKey(Base, TimestampMixin):
    """An actual upstream API key inside a pool. The plaintext key is
    intentionally stored here — gateway operators need it to make calls.
    Encrypt later via vault if compliance asks for it.
    """
    __tablename__ = "gw_pool_api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    pool_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("gw_pools.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(120))
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 429-cooldown: set when upstream returns quota-exhausted; key is skipped
    # by the picker until this timestamp passes. None = not on cooldown.
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    pool: Mapped["GwPool"] = relationship(back_populates="keys")


class GwGatewayKey(Base, TimestampMixin):
    """A key issued to an external client to call the gateway.
    Prefix shown in UI; full hash stored for verify().
    """
    __tablename__ = "gw_gateway_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    allowed_functions: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"),
    )
    # Tenant scope. NULL = legacy / super_admin-issued (visible to super only).
    # Domain admins see + manage only the keys for their own domain.
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="SET NULL"), index=True,
    )
    # When set, async /submit results POST to this URL once status moves
    # to succeeded/failed. Best-effort — failure to deliver doesn't fail
    # the original job.
    webhook_url: Mapped[str | None] = mapped_column(Text)
    # Rate-limit + quota counters. rate_limit_per_minute throttles bursts;
    # daily_quota caps total calls per key per day (0 = unlimited). The
    # daily_reset worker zeros used_today at UTC midnight (re-uses the
    # same job that ApiKey already uses — see app/workers/daily_reset.py).
    rate_limit_per_minute: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default="60",
    )
    daily_quota: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    used_today: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )


class GwRequest(Base, TimestampMixin):
    """Audit log of every gateway execute call."""
    __tablename__ = "gw_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    gw_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    gateway_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("gw_gateway_keys.id", ondelete="SET NULL"),
    )
    # Tenant scope. Copied from the gateway key at request time so we can
    # filter the requests list per-domain without a join.
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("domains.id", ondelete="SET NULL"), index=True,
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("gw_vendors.id", ondelete="SET NULL"),
    )
    pool_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("gw_pools.id", ondelete="SET NULL"),
    )
    pool_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("gw_pool_api_keys.id", ondelete="SET NULL"),
    )
    function_code: Mapped[str | None] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    request_body: Mapped[dict | None] = mapped_column(JSONType)
    response_body: Mapped[dict | None] = mapped_column(JSONType)
    error_message: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    # Cost / usage breakdown — populated after upstream returns. Tokens
    # parsed out of vendor-specific usage payloads in providers; cost
    # computed from pool's pricing fields. All optional.
    tokens_input: Mapped[int | None] = mapped_column(Integer)
    tokens_output: Mapped[int | None] = mapped_column(Integer)
    cost_cents: Mapped[int | None] = mapped_column(Integer)


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
    "GwVendor",
    "GwApiFunction",
    "GwPool",
    "GwPoolApiKey",
    "GwGatewayKey",
    "GwRequest",
    "FlowJob",
    "ProfileDomainAssignment",
    "Notification",
]
