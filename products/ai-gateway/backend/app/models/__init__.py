"""SQLAlchemy model registry — ai-gateway standalone.

Trimmed to the gateway product surface + shared admin/auth tables.
Grok / Flow / Servers tables are NOT registered — those workflows
live in flowgrok / plxeditor-studio. Migrations from the monorepo
that reference dropped tables are filtered at alembic boot.
"""

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid

from .admin import AuditLog, Domain, DomainQuotaPeriod, Notification, Role
from .auth import ApiKey, User
from .billing import Invoice, Payment, Plan, Subscription
from .gateway import (
    GwApiFunction,
    GwGatewayKey,
    GwPool,
    GwPoolApiKey,
    GwRequest,
    GwVendor,
)
from .tool import ChatSession, PromptTemplate
from .tool_install import ToolInstall, ToolInstallQuotaPeriod

__all__ = [
    # Infrastructure
    "Base", "JSONType", "TimestampMixin", "UUIDType", "_uuid",
    # Admin / tenancy
    "AuditLog", "Domain", "DomainQuotaPeriod", "Notification", "Role",
    # Auth
    "ApiKey", "User",
    # Billing
    "Invoice", "Payment", "Plan", "Subscription",
    # Gateway product (multi-LLM routing)
    "GwApiFunction", "GwGatewayKey", "GwPool", "GwPoolApiKey",
    "GwRequest", "GwVendor",
    # Tool module — chat sessions + prompt templates (used by GW playground)
    "ChatSession", "PromptTemplate",
    # Tool installs — FK target for tenant scoping
    "ToolInstall", "ToolInstallQuotaPeriod",
]
