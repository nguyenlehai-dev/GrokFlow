"""SQLAlchemy model registry — flowgrok standalone.

Keeps the FULL set of models from the GrokFlow monorepo even though
this product's surface only uses the Grok subset. Reason: the
existing multi-tenant code (domain quotas, tool-install scoping,
admin module marketplace) references these tables via FK joins. We
keep the schema so migrations + cross-table queries don't break,
but skip the corresponding admin UI and worker logic that exposes
them. The standalone customer will never see Flow/Gateway/Tool
features but their tables stay empty.

If you're packaging a stricter product (no idle tables), the
follow-up step is to refactor the references in
`app/services/domain_quota.py` + `app/modules/grok/{jobs,projects}`
to make ToolInstall lookups optional.
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
    # Infrastructure
    "Base", "JSONType", "TimestampMixin", "UUIDType", "_uuid",
    # Admin / tenancy
    "AuditLog", "Domain", "DomainQuotaPeriod", "Notification", "Role",
    # Auth
    "ApiKey", "User",
    # Billing
    "Invoice", "Payment", "Plan", "Subscription",
    # Grok
    "File", "GrokProject", "Job", "JobLog", "Profile",
    "ProjectDomainAssignment", "ProjectToolInstallAssignment",
    "ProjectUserAssignment",
    # Tool-install (FK target for tenant scoping — UI hidden)
    "ToolInstall", "ToolInstallQuotaPeriod",
]
