"""In-app notification queue.

Lightweight by design: a single `notifications` table the FE polls every
15s via a bell icon in the header. New events get inserted by the parts
of the code that detect them (job completed/failed, billing due, …) and
respect the per-user notification_prefs map from /api/settings/notifications.

Email delivery for events where `prefs[event].email == True` is the
follow-up phase — for now this only handles in-app.
"""

from app.core.module_registry import ModuleManifest
from .router import router

manifest = ModuleManifest(
    name="notifications",
    label="Notifications",
    router=router,
    tags=("admin",),
)
