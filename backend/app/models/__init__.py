"""SQLAlchemy model registry.

Phase 3 of the BE reorg split the original 765-LOC `models/__init__.py`
into per-domain files:

  _base.py    — shared infra (Base, TimestampMixin, JSONType, UUIDType)
  auth.py     — User, ApiKey
  billing.py  — Plan, Subscription, Payment, Invoice
  admin.py    — Domain, Role, AuditLog, Notification, GitRepo
  grok.py     — Profile, GrokProject, ProjectUserAssignment,
                ProjectDomainAssignment, Job, JobLog, File
  flow.py     — FlowJob
  gateway.py  — GwVendor, GwApiFunction, GwPool, GwPoolApiKey,
                GwGatewayKey, GwRequest

This file is the public surface — `from app.models import User` still
works. It also guarantees every model gets imported (so SQLAlchemy's
`Base.metadata` is fully populated before alembic introspects it).

When adding a new model, drop it into the appropriate per-domain file
and add it to that file's local namespace; this `__init__` re-export
list is the only place that needs updating to expose it package-wide.
"""

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid

from .admin import AuditLog, Domain, DomainQuotaPeriod, GitRepo, Notification, Role
from .auth import ApiKey, User
from .billing import Invoice, Payment, Plan, Subscription
from .flow import FlowJob
from .gateway import (
    GwApiFunction,
    GwGatewayKey,
    GwPool,
    GwPoolApiKey,
    GwRequest,
    GwVendor,
)
from .grok import (
    File,
    GrokProject,
    Job,
    JobLog,
    Profile,
    ProjectDomainAssignment,
    ProjectToolInstallAssignment,
    ProjectUserAssignment,
)
from .servers import (
    Server,
    ServerAlert,
    ServerBackupHistory,
    ServerMetricHistory,
    ServerRebootHistory,
)
from .tool import ChatSession, PromptTemplate
from .tool_distribution import Tool, ToolAsset
from .tool_install import ToolInstall, ToolInstallQuotaPeriod

__all__ = [
    # Infrastructure
    "Base", "JSONType", "TimestampMixin", "UUIDType", "_uuid",
    # Admin / tenancy
    "AuditLog", "Domain", "DomainQuotaPeriod", "GitRepo", "Notification", "Role",
    # Auth
    "ApiKey", "User",
    # Billing
    "Invoice", "Payment", "Plan", "Subscription",
    # Flow
    "FlowJob",
    # Gateway
    "GwApiFunction", "GwGatewayKey", "GwPool", "GwPoolApiKey", "GwRequest", "GwVendor",
    # Grok
    "File", "GrokProject", "Job", "JobLog", "Profile",
    "ProjectDomainAssignment", "ProjectToolInstallAssignment", "ProjectUserAssignment",
    # Servers + monitoring
    "Server", "ServerAlert", "ServerBackupHistory", "ServerMetricHistory", "ServerRebootHistory",
    # Tool module
    "ChatSession", "PromptTemplate",
    # Tool distribution (admin-uploaded installer files + docs)
    "Tool", "ToolAsset",
    # Tool installs (desktop client registrations)
    "ToolInstall", "ToolInstallQuotaPeriod",
]
