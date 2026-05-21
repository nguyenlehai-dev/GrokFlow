import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------- Vendors ----------------


class VendorIn(BaseModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=100)
    short_name: str | None = Field(default=None, max_length=50)
    domain: str | None = Field(default=None, max_length=200)
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class VendorUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    domain: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class VendorOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    short_name: str | None
    domain: str | None
    description: str | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------- API Functions ----------------


class ApiFunctionIn(BaseModel):
    code: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=100)
    function_type: str = Field(default="image", max_length=50)
    description: str | None = None
    request_schema: dict | None = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ApiFunctionUpdate(BaseModel):
    name: str | None = None
    function_type: str | None = None
    description: str | None = None
    request_schema: dict | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class ApiFunctionOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    function_type: str
    description: str | None
    request_schema: dict | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------- Pools ----------------


class PoolIn(BaseModel):
    vendor_id: uuid.UUID
    function_id: uuid.UUID | None = None
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    model: str | None = Field(default=None, max_length=120)
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|inactive)$")
    cooldown_seconds: int = Field(default=300, ge=10, le=86400)
    cost_per_million_input_cents: int = Field(default=0, ge=0)
    cost_per_million_output_cents: int = Field(default=0, ge=0)


class PoolUpdate(BaseModel):
    function_id: uuid.UUID | None = None
    code: str | None = None
    name: str | None = None
    model: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    cooldown_seconds: int | None = Field(default=None, ge=10, le=86400)
    cost_per_million_input_cents: int | None = Field(default=None, ge=0)
    cost_per_million_output_cents: int | None = Field(default=None, ge=0)


class PoolOut(BaseModel):
    id: uuid.UUID
    vendor_id: uuid.UUID
    vendor_name: str
    function_id: uuid.UUID | None
    function_name: str | None
    code: str
    name: str
    model: str | None
    description: str | None
    status: str
    cooldown_seconds: int = 300
    cost_per_million_input_cents: int = 0
    cost_per_million_output_cents: int = 0
    keys_total: int = 0
    keys_active: int = 0
    created_at: datetime


# ---------------- Pool API Keys ----------------


class PoolApiKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    api_key: str = Field(min_length=1)
    project_id: str | None = Field(default=None, max_length=120)
    priority: int = Field(default=100, ge=0, le=10000)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class PoolApiKeyUpdate(BaseModel):
    name: str | None = None
    api_key: str | None = None
    project_id: str | None = None
    priority: int | None = Field(default=None, ge=0, le=10000)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class PoolApiKeyOut(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    name: str
    key_prefix: str
    project_id: str | None
    priority: int
    status: str
    last_used_at: datetime | None
    used_count: int
    created_at: datetime


# ---------------- Gateway Keys (issued to external clients) ----------------


class GatewayKeyIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    allowed_functions: list[str] = Field(default_factory=list)
    webhook_url: str | None = None
    rate_limit_per_minute: int = Field(default=60, ge=1, le=10000)
    daily_quota: int = Field(default=0, ge=0, le=10_000_000)
    # super_admin only: tag the issued key to a specific tenant domain.
    # Domain admins always get their own domain_id forced server-side.
    domain_id: uuid.UUID | None = None


class GatewayKeyUpdate(BaseModel):
    label: str | None = None
    allowed_functions: list[str] | None = None
    webhook_url: str | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=10000)
    daily_quota: int | None = Field(default=None, ge=0, le=10_000_000)
    domain_id: uuid.UUID | None = None  # super_admin only (ignored otherwise)


class GatewayKeyOut(BaseModel):
    id: uuid.UUID
    label: str
    prefix: str
    allowed_functions: list[str]
    status: str
    webhook_url: str | None
    rate_limit_per_minute: int
    daily_quota: int
    used_today: int
    created_at: datetime
    domain_id: uuid.UUID | None = None

    class Config:
        from_attributes = True


class GatewayKeyCreated(GatewayKeyOut):
    plain_key: str


class GatewayKeyVerifyRequest(BaseModel):
    # `key` is the v2 field name; `gateway_api_key` is what the first-gen
    # gateway.plxeditor.com clients send. Accept either so legacy
    # integrations work unchanged.
    key: str | None = None
    gateway_api_key: str | None = None

    @property
    def effective_key(self) -> str:
        return (self.key or self.gateway_api_key or "").strip()


class GatewayKeyVerifyResponse(BaseModel):
    verified: bool
    label: str | None = None
    allowed_functions: list[str] = Field(default_factory=list)


# ---------------- Requests ----------------


class RequestOut(BaseModel):
    id: uuid.UUID
    gw_id: str
    vendor_id: uuid.UUID | None
    vendor_name: str | None
    pool_id: uuid.UUID | None
    pool_name: str | None
    pool_key_id: uuid.UUID | None
    pool_key_name: str | None
    function_code: str | None
    model: str | None
    status: str
    error_message: str | None
    latency_ms: int | None
    tokens_input: int | None = None
    tokens_output: int | None = None
    cost_cents: int | None = None
    # Full request/response payloads so the Requests page can show what the
    # caller asked + what the vendor returned (image data URLs are huge but
    # we already serve them inline in /execute responses, so this matches).
    request_body: dict[str, Any] | None = None
    response_body: dict[str, Any] | None = None
    created_at: datetime


# ---------------- Execute (Playground/Client) ----------------


class ExecuteRequest(BaseModel):
    model: str | None = None
    prompt: str | None = None
    aspect_ratio: str | None = None
    image_size: str | None = None
    reference_image_urls: list[str] = Field(default_factory=list)
    reference_video_urls: list[str] = Field(default_factory=list)
    raw: dict[str, Any] | None = None


class ExecuteResponse(BaseModel):
    request_id: uuid.UUID
    gw_id: str
    status: str
    pool_key_name: str | None
    response: dict | None
    error_message: str | None


# ---------------- Dashboard ----------------


class DashboardOut(BaseModel):
    vendors_total: int
    pools_total: int
    pools_active: int
    pool_keys_total: int
    pool_keys_active: int
    functions_total: int
    gateway_keys_total: int
    gateway_keys_active: int
    requests_total: int
    requests_failed: int
    requests_succeeded: int
    requests_last_24h: int
