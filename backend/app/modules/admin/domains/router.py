"""Domain management.

- Admin endpoints under /api/admin/domains for CRUD.
- Public GET /api/domains/config?host=xxx — frontend calls this on app boot
  to decide which pages are accessible / whether landing is shown.
"""
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.cache import invalidate, redis_cached
from app.core.deps import CurrentUser, SuperAdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.models import Domain, ToolInstall
from app.modules.admin.audit import service as audit
from app.services import nginx_sync
from app.services.domain_quota import get_snapshot as get_quota_snapshot


# How long to cache the public /api/domains/config response. Frontend hits
# this on every full page load; the data changes only when an admin edits
# the domain row, and create/update/delete invalidate the cache below.
# 5 min keeps eviction rare without making admin edits feel stale —
# invalidation is the source of truth, the TTL is just a safety net.
DOMAIN_CONFIG_TTL = 300

# Per-domain controllable actions on a Profile row. Keep in sync with
# the migration default + the frontend (ProfilesPage action buttons).
# When a tenant admin's domain doesn't include a key here, the backend
# 403s the corresponding mutate endpoint and the frontend grays out the
# button. Super_admin is exempt — full set always.
PROFILE_ACTIONS = ["auto_login", "upload_cookies", "stop_vnc", "disable", "delete"]

router = APIRouter(tags=["domains"])


# ---------------- Schemas ----------------

class DomainIn(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|disabled)$")
    allow_landing: bool = True
    allow_register: bool = True
    allow_login: bool = True
    allow_all_pages: bool = False
    allowed_pages: list[str] = Field(default_factory=list)
    brand_name: str | None = None
    require_playground_key: bool = True
    maintenance_mode: bool = False
    maintenance_message: str | None = Field(default=None, max_length=2000)
    maintenance_starts_at: datetime | None = None
    maintenance_announcement: str | None = Field(default=None, max_length=2000)
    login_template: str = Field(default="default", pattern="^(default|admin)$")
    allowed_profile_actions: list[str] = Field(default_factory=lambda: list(PROFILE_ACTIONS))
    # Daily job quota — None = unlimited. Frontend sends int >= 0 or null.
    jobs_quota_per_day: int | None = Field(default=None, ge=0)
    # UTC hour 0-23 the daily quota counter rolls over. Default 0 = midnight UTC.
    quota_reset_hour_utc: int = Field(default=0, ge=0, le=23)


class DomainUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    allow_landing: bool | None = None
    allow_register: bool | None = None
    allow_login: bool | None = None
    allow_all_pages: bool | None = None
    allowed_pages: list[str] | None = None
    brand_name: str | None = None
    require_playground_key: bool | None = None
    maintenance_mode: bool | None = None
    maintenance_message: str | None = Field(default=None, max_length=2000)
    maintenance_starts_at: datetime | None = None
    maintenance_announcement: str | None = Field(default=None, max_length=2000)
    login_template: str | None = Field(default=None, pattern="^(default|admin)$")
    allowed_profile_actions: list[str] | None = None
    jobs_quota_per_day: int | None = Field(default=None, ge=0)
    quota_reset_hour_utc: int | None = Field(default=None, ge=0, le=23)


class DomainOut(BaseModel):
    id: uuid.UUID
    hostname: str
    label: str
    description: str | None
    status: str
    allow_landing: bool
    allow_register: bool
    allow_login: bool
    allow_all_pages: bool
    allowed_pages: list[str]
    brand_name: str | None
    require_playground_key: bool
    maintenance_mode: bool = False
    maintenance_message: str | None = None
    maintenance_starts_at: datetime | None = None
    maintenance_announcement: str | None = None
    login_template: str = "default"
    allowed_profile_actions: list[str] = Field(default_factory=list)
    jobs_quota_per_day: int | None = None
    quota_reset_hour_utc: int = 0

    class Config:
        from_attributes = True


class DomainConfig(BaseModel):
    """Public-facing config — what the frontend needs to render this host."""
    hostname: str
    label: str
    status: str
    allow_landing: bool
    allow_register: bool
    allow_login: bool
    allow_all_pages: bool
    allowed_pages: list[str]
    brand_name: str | None
    require_playground_key: bool
    # Per-domain maintenance window. Frontend renders the maintenance
    # screen for non-admin users when this is true OR when
    # `maintenance_starts_at` has elapsed.
    maintenance_mode: bool = False
    maintenance_message: str | None = None
    maintenance_starts_at: datetime | None = None
    maintenance_announcement: str | None = None
    login_template: str = "default"
    allowed_profile_actions: list[str] = Field(default_factory=list)


# ---------------- Admin CRUD ----------------

@router.get("/api/admin/domains", response_model=list[DomainOut])
async def list_domains(admin: SuperAdminUser, db: DbSession) -> list[Domain]:
    rows = (await db.execute(select(Domain).order_by(Domain.hostname))).scalars().all()
    return list(rows)


@router.post("/api/admin/domains", response_model=DomainOut, status_code=status.HTTP_201_CREATED)
async def create_domain(payload: DomainIn, admin: SuperAdminUser, db: DbSession) -> Domain:
    hostname = payload.hostname.strip().lower()
    if (await db.execute(select(Domain).where(Domain.hostname == hostname))).scalar_one_or_none():
        raise InvalidPayload(f"Domain '{hostname}' đã tồn tại")
    # Sanitize allowed_profile_actions: keep only keys we recognize.
    # Defensive — frontend can only send the known set, but a hand-rolled
    # API call could try to inject arbitrary strings.
    safe_actions = [a for a in payload.allowed_profile_actions if a in PROFILE_ACTIONS]
    d = Domain(
        hostname=hostname,
        label=payload.label,
        description=payload.description,
        status=payload.status,
        allow_landing=payload.allow_landing,
        allow_register=payload.allow_register,
        allow_login=payload.allow_login,
        allow_all_pages=payload.allow_all_pages,
        allowed_pages=payload.allowed_pages,
        brand_name=payload.brand_name,
        require_playground_key=payload.require_playground_key,
        maintenance_mode=payload.maintenance_mode,
        maintenance_message=payload.maintenance_message,
        maintenance_starts_at=payload.maintenance_starts_at,
        maintenance_announcement=payload.maintenance_announcement,
        login_template=payload.login_template,
        allowed_profile_actions=safe_actions,
        jobs_quota_per_day=payload.jobs_quota_per_day,
        quota_reset_hour_utc=payload.quota_reset_hour_utc,
    )
    db.add(d)
    await db.flush()
    # Auto-write nginx vhost so the domain is reachable as soon as DNS is set.
    # Wildcard '*' has no vhost (it's the catch-all DB fallback, not a real host).
    if d.status == "active" and d.hostname != "*":
        nginx_sync.write_vhost(d.hostname)
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_domain",
        target_type="domain", target_id=d.id, metadata={"hostname": hostname},
    )
    await db.commit()
    await db.refresh(d)
    # Bust any cached config for this hostname (+ the * wildcard, which any
    # unknown host might be falling back to and now needs to recompute).
    await invalidate(f"cache:domain-config:{hostname}")
    await invalidate("cache:domain-config:*")
    return d


@router.patch("/api/admin/domains/{domain_id}", response_model=DomainOut)
async def update_domain(
    domain_id: uuid.UUID, payload: DomainUpdate, admin: SuperAdminUser, db: DbSession,
) -> Domain:
    d = await db.get(Domain, domain_id)
    if not d:
        raise NotFound("domain")
    changes: dict[str, Any] = {}
    # Fields where `None` means "don't touch" (admin didn't send them).
    for field in (
        "label", "description", "status", "allow_landing", "allow_register",
        "allow_login", "allow_all_pages", "allowed_pages", "brand_name",
        "require_playground_key", "maintenance_mode", "maintenance_message",
        "maintenance_announcement", "login_template",
    ):
        v = getattr(payload, field)
        if v is not None:
            setattr(d, field, v)
            if isinstance(v, list):
                changes[field] = "updated"
            elif isinstance(v, datetime):
                changes[field] = v.isoformat()
            else:
                changes[field] = v
    # allowed_profile_actions is sanitized + tracked separately so we can
    # diff which actions were added/removed in the audit log.
    if payload.allowed_profile_actions is not None:
        safe_actions = [a for a in payload.allowed_profile_actions if a in PROFILE_ACTIONS]
        if set(safe_actions) != set(d.allowed_profile_actions or []):
            removed = sorted(set(d.allowed_profile_actions or []) - set(safe_actions))
            added = sorted(set(safe_actions) - set(d.allowed_profile_actions or []))
            d.allowed_profile_actions = safe_actions
            changes["allowed_profile_actions"] = {"added": added, "removed": removed}

    # `maintenance_starts_at` is special: admin needs to be able to
    # CLEAR it (set to null) when the patch is done. Always honor the
    # value sent — including None — but only log a change when something
    # actually moved.
    if "maintenance_starts_at" in payload.model_fields_set:
        new_starts_at = payload.maintenance_starts_at
        if d.maintenance_starts_at != new_starts_at:
            d.maintenance_starts_at = new_starts_at
            changes["maintenance_starts_at"] = (
                new_starts_at.isoformat() if new_starts_at else None
            )

    # `jobs_quota_per_day`: same null-vs-omitted distinction as the
    # maintenance timestamp. None = unlimited (allowed value), missing =
    # don't touch. Use model_fields_set so admin can clear an existing
    # quota by passing null.
    if "jobs_quota_per_day" in payload.model_fields_set:
        new_quota = payload.jobs_quota_per_day
        if d.jobs_quota_per_day != new_quota:
            d.jobs_quota_per_day = new_quota
            changes["jobs_quota_per_day"] = new_quota

    # quota_reset_hour_utc: explicit non-null int, validated 0-23.
    if payload.quota_reset_hour_utc is not None:
        if d.quota_reset_hour_utc != payload.quota_reset_hour_utc:
            d.quota_reset_hour_utc = payload.quota_reset_hour_utc
            changes["quota_reset_hour_utc"] = payload.quota_reset_hour_utc
    # Re-sync nginx config: status flip or hostname change could need add/remove.
    if d.hostname != "*":
        if d.status == "active":
            nginx_sync.write_vhost(d.hostname)
        else:
            nginx_sync.delete_vhost(d.hostname)
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_domain",
        target_type="domain", target_id=d.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(d)
    await invalidate(f"cache:domain-config:{d.hostname}")
    return d


@router.delete("/api/admin/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain_id: uuid.UUID, admin: SuperAdminUser, db: DbSession) -> None:
    d = await db.get(Domain, domain_id)
    if not d:
        raise NotFound("domain")
    if d.hostname == "*":
        raise InvalidPayload("Không xóa được domain mặc định '*'")
    nginx_sync.delete_vhost(d.hostname)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_domain",
        target_type="domain", target_id=d.id, metadata={"hostname": d.hostname},
    )
    hostname = d.hostname
    await db.delete(d)
    await db.commit()
    await invalidate(f"cache:domain-config:{hostname}")


# ---------------- Public config ----------------


async def _override_with_install(
    cfg: "DomainConfig", db: DbSession, tool_install_id: str,
) -> "DomainConfig":
    """Apply per-install overrides on top of a resolved DomainConfig.

    Called when the request bears X-Tool-Install-Id. The install's
    permissions are the source of truth for the desktop client surface —
    they shadow the domain's pages/template/flags. This is the enforcement
    side of the "phân quyền theo tool_id" flow super_admin uses in
    /admin/tool-installs.
    """
    install = (await db.execute(
        select(ToolInstall).where(ToolInstall.tool_id == tool_install_id)
    )).scalar_one_or_none()
    if not install:
        return cfg
    # Pending / disabled installs see ONLY the login screen (or a
    # waiting-for-approval screen the FE picks). Don't expose any pages.
    if install.status != "active":
        return DomainConfig(
            hostname=cfg.hostname, label=install.label or cfg.label,
            status=install.status,
            allow_landing=False, allow_register=False,
            allow_login=install.allow_login,
            allow_all_pages=False, allowed_pages=[],
            brand_name=install.brand_name or cfg.brand_name,
            require_playground_key=cfg.require_playground_key,
            maintenance_mode=cfg.maintenance_mode,
            maintenance_message=cfg.maintenance_message,
            maintenance_starts_at=cfg.maintenance_starts_at,
            maintenance_announcement=cfg.maintenance_announcement,
            login_template=install.login_template,
            allowed_profile_actions=list(cfg.allowed_profile_actions or []),
        )
    return DomainConfig(
        hostname=cfg.hostname,
        label=install.label or cfg.label,
        status=cfg.status,
        allow_landing=install.allow_landing,
        allow_register=install.allow_register,
        allow_login=install.allow_login,
        allow_all_pages=install.allow_all_pages,
        allowed_pages=list(install.allowed_pages or []),
        brand_name=install.brand_name or cfg.brand_name,
        require_playground_key=cfg.require_playground_key,
        maintenance_mode=cfg.maintenance_mode,
        maintenance_message=cfg.maintenance_message,
        maintenance_starts_at=cfg.maintenance_starts_at,
        maintenance_announcement=cfg.maintenance_announcement,
        login_template=install.login_template,
        allowed_profile_actions=list(cfg.allowed_profile_actions or []),
    )


@router.get("/api/domains/config", response_model=DomainConfig)
async def get_domain_config(
    host: str,
    db: DbSession,
    x_tool_install_id: str | None = Header(default=None, alias="X-Tool-Install-Id"),
) -> DomainConfig:
    """Resolve the access config for a given hostname (or tool install).

    Resolution order:
      1. Base config from Domain row (exact hostname → '*' fallback → permissive default).
      2. If X-Tool-Install-Id header present + install exists → override
         with install's pages/flags/login_template/brand_name.

    The endpoint is NOT cached anymore (was redis_cached(ttl=120) keyed by
    host alone) because each install gets a different effective config —
    sharing a cache key would leak one customer's pages to another. For
    the web FE that doesn't send the header, the resolution cost is one
    indexed lookup, which is cheap.
    """
    h = host.strip().lower()
    # Strip port for matching
    if ":" in h:
        h = h.split(":", 1)[0]

    d = (await db.execute(select(Domain).where(Domain.hostname == h))).scalar_one_or_none()
    if not d:
        d = (await db.execute(select(Domain).where(Domain.hostname == "*"))).scalar_one_or_none()
    if d:
        cfg = DomainConfig(
            hostname=d.hostname, label=d.label, status=d.status,
            allow_landing=d.allow_landing, allow_register=d.allow_register,
            allow_login=d.allow_login, allow_all_pages=d.allow_all_pages,
            allowed_pages=d.allowed_pages, brand_name=d.brand_name,
            require_playground_key=d.require_playground_key,
            maintenance_mode=d.maintenance_mode,
            maintenance_message=d.maintenance_message,
            maintenance_starts_at=d.maintenance_starts_at,
            maintenance_announcement=d.maintenance_announcement,
            login_template=d.login_template,
            allowed_profile_actions=list(d.allowed_profile_actions or []),
        )
    else:
        # Fail-open default — no Domain row + no '*' fallback.
        cfg = DomainConfig(
            hostname=h, label=h, status="active",
            allow_landing=True, allow_register=True, allow_login=True,
            allow_all_pages=True, allowed_pages=[], brand_name=None,
            require_playground_key=True,
            maintenance_mode=False, maintenance_message=None,
            maintenance_starts_at=None, maintenance_announcement=None,
            login_template="default",
            allowed_profile_actions=list(PROFILE_ACTIONS),
        )

    if x_tool_install_id:
        cfg = await _override_with_install(cfg, db, x_tool_install_id)
    return cfg


# ---------------- Per-user quota readout ----------------

class DomainQuotaOut(BaseModel):
    unlimited: bool
    period_date: str
    period_start: str
    period_end: str
    used: int
    limit: int | None = None
    remaining: int | None = None
    # Which scope's counter is being reported — "tool_install" when the
    # caller's install has its own cap, "domain" when falling back to the
    # tenant cap, "none" when neither is set. Lets the FE pill tweak its
    # tooltip ("Kiosk quota" vs "Tenant quota").
    scope: str = "none"


@router.get("/api/domain/quota", response_model=DomainQuotaOut)
async def get_my_quota(user: CurrentUser, db: DbSession) -> DomainQuotaOut:
    """Current daily quota state for the authenticated user.

    Tool desktop polls this every ~30s to keep the topbar pill in sync.
    Resolution: if the user's tool install carries its own quota → report
    that. Else fall back to the tenant's domain quota. Super_admin (no
    domain/install) returns unlimited."""
    snap = await get_quota_snapshot(db, user.domain_id, user.tool_install_id)
    return DomainQuotaOut(**snap)
