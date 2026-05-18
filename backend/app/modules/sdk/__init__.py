"""GrokFlow Core SDK — endpoints exposed for third-party module containers.

Modules call back into core through /api/sdk/* using two headers:
  - X-GrokFlow-Service-Token: identifies the module (issued at install)
  - X-GrokFlow-User-Token:    optional, the JWT of the user currently
                              using the module via iframe

Every endpoint enforces scope checks against `manifest.permissions.scopes`
so a module can only do what it declared. See docs/MODULE-MARKETPLACE.md.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="sdk",
    label="Module SDK (core surface for plugins)",
    router=router,
    tags=("sdk",),
)
