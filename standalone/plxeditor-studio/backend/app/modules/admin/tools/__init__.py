"""Admin Tool Distribution module — CRUD for Tool + ToolAsset rows.

Distinct from `app.modules.tool` (per-user prompt templates) and
`app.modules.tool_install` (desktop kiosk registrations). This module
manages the **file distribution catalog** — installer .exe/.dmg and
documentation PDFs that admins upload + end-users download.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="admin_tools_distribution",
    label="Admin Tool Distribution",
    router=router,
    tags=("admin",),
)
