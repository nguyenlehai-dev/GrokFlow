"""Auth surface — login, refresh, /me, registration."""

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.module_registry import ModuleManifest
from .router import router

# Legacy gateway.plxeditor.com served auth at /api/v1/auth/* — v2 reorg
# dropped the /v1 segment. Re-mount the same handler functions at the
# legacy prefix so existing customer integrations keep working without
# a code change. We use FastAPI's own add_api_route which rebuilds the
# regex/param/response chain — safer than copy()-ing the APIRoute.
_legacy_auth = APIRouter(prefix="/api/v1/auth", tags=["auth (legacy)"])
for r in router.routes:
    if not isinstance(r, APIRoute):
        continue
    if not r.path.startswith("/api/auth"):
        continue
    tail = r.path[len("/api/auth"):]  # leading "/" preserved
    _legacy_auth.add_api_route(
        path=tail,
        endpoint=r.endpoint,
        response_model=r.response_model,
        status_code=r.status_code,
        tags=r.tags,
        methods=list(r.methods or []),
        name=f"legacy_{r.name}",
        operation_id=f"legacy_{r.unique_id}",
        include_in_schema=False,  # keep /docs free of duplicate entries
    )

combined = APIRouter()
combined.include_router(router)
combined.include_router(_legacy_auth)

manifest = ModuleManifest(
    name="auth",
    label="Auth",
    router=combined,
    tags=("public", "auth"),
)
