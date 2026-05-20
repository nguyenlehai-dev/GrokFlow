from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.http_client import close_http
from app.core.module_registry import register_all
from app.core.monitoring import init_sentry
from app.modules.entitlements.service import seed_default_plans

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

    # ai-gateway has no VNC/Chromium runtime — pure API gateway.
    # The flowgrok variant of this file spawns nginx_sync.refresh_vnc_map,
    # vnc_event_listener, vnc_tab_gc, and vnc_cdp_watchdog here. Restore
    # those if a future ai-gateway variant ever needs browser automation.

    yield
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


# Mount every feature module's router via the registry. See
# `app/core/module_registry.py` for the manifest contract and the
# canonical module list.
register_all(app)
