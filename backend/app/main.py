from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.http_client import close_http
from app.core.monitoring import init_sentry
from app.modules.admin.router import router as admin_router
from app.modules.entitlements.service import seed_default_plans
from app.modules.auth.api_keys.router import router as api_keys_router
from app.modules.admin.audit.router import router as audit_router
from app.modules.admin.gallery.router import router as gallery_router
from app.modules.admin.notifications.router import router as notifications_router
from app.modules.auth.router import router as auth_router
from app.modules.landing.billing.router import router as billing_router
from app.modules.admin.dashboard.router import router as dashboard_router
from app.modules.admin.domains.router import router as domains_router
from app.modules.grok.files.router import router as files_router
from app.modules.flow.router import router as flow_router
from app.modules.gateway.router import router as gateway_router
# Removed: app.modules.gateway_proxy — was a thin SSO proxy to the legacy
# `gatewaygrok-backend` service. That service is gone; the LLM Gateway
# (app.modules.gateway) lives inside this very process now.
from app.modules.admin.git_admin.router import router as git_admin_router
from app.modules.grok.jobs.router import router as jobs_router
from app.modules.landing.plans_public.router import router as plans_public_router
from app.modules.grok.profiles.router import router as profiles_router
from app.modules.grok.projects.router import router as grok_projects_router
from app.modules.landing.public_v1.router import router as public_v1_router
from app.modules.landing.public_try.router import router as public_try_router
from app.modules.admin.roles.router import router as roles_router
from app.modules.admin.settings.router import router as settings_router

init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic is the source of truth for the schema (see `alembic/versions/`).
    # We used to call Base.metadata.create_all here, but that races with
    # alembic — new model columns end up auto-created via SQLAlchemy on boot,
    # then the matching migration fails with "table already exists" / "column
    # already exists". Boot now leaves DDL alone; deploy must run
    # `alembic upgrade head` separately (handled by the deploy script /
    # systemd unit). Tests can still call create_all explicitly via fixtures.
    async with SessionLocal() as db:
        await seed_default_plans(db)
    yield
    # On shutdown: drain the shared httpx pool so workers exit cleanly.
    await close_http()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.5.0",
    lifespan=lifespan,
    debug=settings.APP_DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.APP_ENV, "version": app.version}


app.include_router(auth_router)
app.include_router(api_keys_router)
app.include_router(profiles_router)
app.include_router(jobs_router)
app.include_router(files_router)
app.include_router(audit_router)
app.include_router(gallery_router)
app.include_router(notifications_router)
app.include_router(admin_router)
app.include_router(billing_router)
app.include_router(dashboard_router)
app.include_router(domains_router)
app.include_router(flow_router)
app.include_router(gateway_router)
# (gateway_proxy_router removed alongside its module — see import section.)
app.include_router(git_admin_router)
app.include_router(roles_router)
app.include_router(settings_router)
app.include_router(plans_public_router)
app.include_router(public_v1_router)
app.include_router(public_try_router)
app.include_router(grok_projects_router)
