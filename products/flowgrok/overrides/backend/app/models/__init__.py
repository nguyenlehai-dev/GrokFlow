"""SQLAlchemy model registry — flowgrok standalone.

Auto-generated override (kept under products/flowgrok/overrides/). Edit
the monorepo's app/models/*.py for table changes, then edit this file
ONLY when adding/removing whole tables from the flowgrok product.

The monorepo's models/__init__.py imports Flow / Gateway / Servers /
Module-marketplace tables too — those don't exist in this build, so we
re-declare a slimmer registry here.
"""

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid

from .admin import AuditLog, Domain, DomainQuotaPeriod, Notification, Role
from .auth import ApiKey, User
from .billing import Invoice, Payment, Plan, Subscription
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
    "Base", "JSONType", "TimestampMixin", "UUIDType", "_uuid",
    "AuditLog", "Domain", "DomainQuotaPeriod", "Notification", "Role",
    "ApiKey", "User",
    "Invoice", "Payment", "Plan", "Subscription",
    "File", "GrokProject", "Job", "JobLog", "Profile",
    "ProjectDomainAssignment", "ProjectToolInstallAssignment",
    "ProjectUserAssignment",
    "ToolInstall", "ToolInstallQuotaPeriod",
]
