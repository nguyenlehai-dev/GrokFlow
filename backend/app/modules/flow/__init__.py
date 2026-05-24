"""Flow module — native video-processing (FFmpeg) inside GrokFlow.

Previously this module reverse-proxied a separate `flow-api` Docker
container; that side-car has been retired in favour of running FFmpeg
directly out of this backend. Same FE shape, simpler ops:

  - One auth surface (GrokFlow JWT — no separate API keys / users)
  - One DB (Postgres `flow_jobs` table, alembic-managed)
  - One storage volume (`storage/flow/{input,output}`)
  - One container (this backend) — `ffmpeg` baked into Dockerfile.prod

See `docs/FLOW-SETUP.md` for the operator runbook.
"""

from app.core.module_registry import ModuleManifest
from .router import router
from .v1_router import router as v1_router

manifest = ModuleManifest(
    name="flow",
    label="Flow (video)",
    router=router,
    tags=("product", "flow",),
)

# Public v1 API — separate manifest so admin tools (audit log, OpenAPI
# tag ordering) can distinguish partner-facing endpoints from internal.
manifest_v1 = ModuleManifest(
    name="flow_v1",
    label="Flow v1 API",
    router=v1_router,
    tags=("product", "flow", "public"),
)
