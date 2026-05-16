"""Server management module — start/stop/reboot managed VPS hosts.

Mirrors `frontend/src/modules/servers/`. SSH credentials live in the
`servers` table (Fernet-encrypted password) and the backend opens a
fresh paramiko session per request — no long-lived connections.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="servers",
    label="Server management",
    router=router,
    tags=("admin", "super",),
)
