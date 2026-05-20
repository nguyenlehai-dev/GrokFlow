"""SQLAlchemy model registry — plxeditor-studio standalone.

The full editor product: Grok + Flow video post-processing. Tables
for dropped product surfaces (Gateway / Servers / Tool registry)
are not registered — those workflows live in ai-gateway / flowgrok.
"""

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid

from .admin import AuditLog, Domain, DomainQuotaPeriod, Notification, Role
from .auth import ApiKey, User
from .billing import Invoice, Payment, Plan, Subscription
from .flow import FlowJob
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
    # Grok product
    "File", "GrokProject", "Job", "JobLog", "Profile",
    "ProjectDomainAssignment", "ProjectToolInstallAssignment",
    "ProjectUserAssignment",
    # Flow product
    "FlowJob",
    # Tool-install (FK target for tenant scoping — UI hidden)
    "ToolInstall", "ToolInstallQuotaPeriod",
]
