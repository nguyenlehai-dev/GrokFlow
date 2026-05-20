"""LLM Gateway models — vendors, functions, pools, keys, requests.

Inspired by gateway.plxeditor.com — admin manages Vendors (Google, OpenAI…),
Pools (a group of API keys for a specific model + function), API Functions
(Image Generation, Text Generation…), and Gateway Keys (issued to external
clients). Requests log every execute call for observability.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


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

    vendor: Mapped[GwVendor] = relationship()
    function: Mapped[GwApiFunction | None] = relationship()
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

    pool: Mapped[GwPool] = relationship(back_populates="keys")


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
