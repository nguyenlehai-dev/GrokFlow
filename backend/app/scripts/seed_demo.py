"""Idempotent demo-data seeder.

Run inside the backend container:

    docker compose exec backend python -m app.scripts.seed_demo

Creates a complete picture so the UI has something to render on a fresh
clone: 2 demo tenants (localhost, grok.local), per-tenant Editor/Viewer
roles, multiple users per tenant, API keys, a couple of Grok profiles
with projects + domain assignments, a paid subscription, and a few
notifications for the super_admin. Skips anything that already exists,
so re-running it is safe.

All demo passwords: ``Demo1234!``
"""
from __future__ import annotations

import asyncio
import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    ApiKey, Domain, GrokProject, Notification, Plan, Profile, Role,
    Subscription, User,
)
from app.models.grok import ProjectDomainAssignment


DEMO_PASSWORD = "Demo1234!"
DEMO_HOSTNAMES = ["localhost", "grok.local"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_domain(db, hostname: str, label: str, brand: str) -> Domain:
    d = (await db.execute(select(Domain).where(Domain.hostname == hostname))).scalar_one_or_none()
    if d:
        return d
    d = Domain(
        hostname=hostname, label=label, status="active",
        allow_landing=True, allow_register=True, allow_login=True,
        allow_all_pages=True, allowed_pages=[],
        brand_name=brand, require_playground_key=False,
        maintenance_mode=False, login_template="default",
    )
    db.add(d)
    await db.flush()
    print(f"  + domain {hostname}")
    return d


async def _get_or_create_role(db, domain_id, name: str, pages: list[str], description: str) -> Role:
    r = (await db.execute(
        select(Role).where(Role.domain_id == domain_id, Role.name == name)
    )).scalar_one_or_none()
    if r:
        return r
    r = Role(
        domain_id=domain_id, name=name, description=description,
        allowed_pages=pages, status="active",
    )
    db.add(r)
    await db.flush()
    print(f"    + role {name} ({len(pages)} pages)")
    return r


async def _get_or_create_user(
    db, email: str, role: str, domain_id, plan_id, role_id=None, full_name: str | None = None,
) -> User:
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if u:
        return u
    u = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        full_name=full_name,
        role=role,
        status="active",
        domain_id=domain_id,
        plan_id=plan_id,
        role_id=role_id,
        locale="vi",
    )
    db.add(u)
    await db.flush()
    print(f"    + user {email} ({role})")
    return u


async def _get_or_create_api_key(db, user_id, name: str) -> ApiKey | None:
    """Issue 1 API key per user. Skip if user already has one with this name."""
    existing = (await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id, ApiKey.name == name)
    )).scalar_one_or_none()
    if existing:
        return None
    raw = secrets.token_urlsafe(24)
    prefix = "uxpm_live_" + raw[:8]
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    k = ApiKey(
        user_id=user_id, name=name,
        key_prefix=prefix, key_hash=key_hash,
        status="active", allowed_providers=["grok"], allowed_job_types=["image", "video"],
        rate_limit_per_minute=60, daily_limit=1000,
    )
    db.add(k)
    await db.flush()
    return k


async def _get_or_create_profile(db, user_id, name: str, provider: str = "grok") -> Profile:
    p = (await db.execute(
        select(Profile).where(Profile.user_id == user_id, Profile.name == name)
    )).scalar_one_or_none()
    if p:
        return p
    p = Profile(
        user_id=user_id, name=name, provider=provider,
        profile_path=f"/app/browser_profiles/{name.lower().replace(' ', '_')}",
        status="ready",
        max_concurrent_jobs=4, max_concurrent_video=2,
    )
    db.add(p)
    await db.flush()
    print(f"  + profile {name}")
    return p


async def _get_or_create_project(db, profile_id, slug: str, name: str, description: str) -> GrokProject:
    p = (await db.execute(
        select(GrokProject).where(
            GrokProject.profile_id == profile_id, GrokProject.grok_project_id == slug,
        )
    )).scalar_one_or_none()
    if p:
        return p
    p = GrokProject(
        profile_id=profile_id, grok_project_id=slug,
        name=name, description=description,
    )
    db.add(p)
    await db.flush()
    print(f"    + project {name}")
    return p


async def _assign_project_to_domain(db, project_id, domain_id) -> None:
    existing = (await db.execute(
        select(ProjectDomainAssignment).where(
            ProjectDomainAssignment.project_id == project_id,
            ProjectDomainAssignment.domain_id == domain_id,
        )
    )).scalar_one_or_none()
    if existing:
        return
    db.add(ProjectDomainAssignment(project_id=project_id, domain_id=domain_id))
    await db.flush()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

EDITOR_PAGES = [
    "/dashboard", "/api-keys", "/billing", "/profiles", "/jobs",
    "/grok/playground", "/gallery/images", "/gallery/videos", "/audit-logs",
]
VIEWER_PAGES = ["/dashboard", "/gallery/images", "/billing"]


async def main() -> None:
    async with SessionLocal() as db:
        print("→ resolving plans + super_admin")
        free_plan = (await db.execute(select(Plan).where(Plan.code == "free"))).scalar_one_or_none()
        if not free_plan:
            print("!! no 'free' plan in DB — backend boot should have seeded it. Aborting.")
            return
        # Pick a paid plan (anything with price > 0) for the demo subscription.
        paid_plan = (await db.execute(
            select(Plan).where(Plan.code != "free").order_by(Plan.sort_order).limit(1)
        )).scalar_one_or_none()

        super_admin = (await db.execute(
            select(User).where(User.email == "admin@local.test")
        )).scalar_one_or_none()
        if not super_admin:
            print("!! admin@local.test not found — run create_admin first. Aborting.")
            return

        print("→ ensuring demo domains")
        domains: dict[str, Domain] = {}
        for host in DEMO_HOSTNAMES:
            label = f"{host} (demo)"
            brand = f"{host.split('.')[0].title()} Demo"
            domains[host] = await _get_or_create_domain(db, host, label, brand)

        print("→ creating roles per domain")
        roles: dict[tuple[str, str], Role] = {}
        for host, d in domains.items():
            roles[(host, "Editor")] = await _get_or_create_role(
                db, d.id, "Editor", EDITOR_PAGES,
                "Quyền chỉnh sửa: profile, job, gallery, billing",
            )
            roles[(host, "Viewer")] = await _get_or_create_role(
                db, d.id, "Viewer", VIEWER_PAGES,
                "Quyền chỉ đọc: dashboard, gallery, billing",
            )

        print("→ creating users per domain")
        users: list[User] = []
        for host, d in domains.items():
            short = host.split(".")[0]
            users.append(await _get_or_create_user(
                db, f"admin@{host}", role="admin", domain_id=d.id,
                plan_id=free_plan.id, full_name=f"{short.title()} Admin",
            ))
            users.append(await _get_or_create_user(
                db, f"editor@{host}", role="user", domain_id=d.id,
                plan_id=free_plan.id, role_id=roles[(host, "Editor")].id,
                full_name=f"{short.title()} Editor",
            ))
            users.append(await _get_or_create_user(
                db, f"viewer@{host}", role="user", domain_id=d.id,
                plan_id=free_plan.id, role_id=roles[(host, "Viewer")].id,
                full_name=f"{short.title()} Viewer",
            ))

        print("→ issuing API keys (1 per demo user)")
        new_keys = 0
        for u in users:
            k = await _get_or_create_api_key(db, u.id, "Demo key")
            if k:
                new_keys += 1
        if new_keys:
            print(f"    + {new_keys} api keys")

        print("→ creating super_admin Grok profiles + projects")
        profile_a = await _get_or_create_profile(db, super_admin.id, "Demo Grok Account A")
        profile_b = await _get_or_create_profile(db, super_admin.id, "Demo Grok Account B")

        proj_default = await _get_or_create_project(
            db, profile_a.id, "demo-default", "Default Project",
            "Catch-all project assigned to wildcard domain *",
        )
        proj_localhost = await _get_or_create_project(
            db, profile_a.id, "demo-localhost", "Tenant: localhost",
            "Project dành riêng cho tenant localhost",
        )
        proj_grok_local = await _get_or_create_project(
            db, profile_b.id, "demo-grok-local", "Tenant: grok.local",
            "Project dành riêng cho tenant grok.local",
        )

        print("→ wiring project ↔ domain assignments")
        wildcard = (await db.execute(select(Domain).where(Domain.hostname == "*"))).scalar_one_or_none()
        if wildcard:
            await _assign_project_to_domain(db, proj_default.id, wildcard.id)
        await _assign_project_to_domain(db, proj_localhost.id, domains["localhost"].id)
        await _assign_project_to_domain(db, proj_grok_local.id, domains["grok.local"].id)

        if paid_plan:
            print(f"→ creating demo subscription on '{paid_plan.code}' for editor@localhost")
            editor_localhost = (await db.execute(
                select(User).where(User.email == "editor@localhost")
            )).scalar_one()
            existing_sub = (await db.execute(
                select(Subscription).where(
                    Subscription.user_id == editor_localhost.id,
                    Subscription.plan_id == paid_plan.id,
                )
            )).scalar_one_or_none()
            if not existing_sub:
                now = datetime.now(timezone.utc)
                db.add(Subscription(
                    user_id=editor_localhost.id,
                    plan_id=paid_plan.id,
                    status="active",
                    billing_cycle="monthly",
                    provider="manual",
                    current_period_start=now,
                    current_period_end=now + timedelta(days=30),
                ))
                editor_localhost.plan_id = paid_plan.id
                print(f"    + active subscription → editor@localhost on {paid_plan.code}")

        print("→ seeding notifications for super_admin")
        existing_notifs = (await db.execute(
            select(Notification).where(Notification.user_id == super_admin.id).limit(1)
        )).scalar_one_or_none()
        if not existing_notifs:
            db.add_all([
                Notification(
                    user_id=super_admin.id, kind="domain_assignment",
                    title="Demo domains ready",
                    body="localhost + grok.local đã được tạo với Editor/Viewer roles.",
                    target_url="/admin/domains", severity="info",
                ),
                Notification(
                    user_id=super_admin.id, kind="billing_due",
                    title="Demo subscription đang active",
                    body="editor@localhost vừa chuyển sang gói trả phí.",
                    target_url="/admin/billing", severity="success",
                ),
                Notification(
                    user_id=super_admin.id, kind="job_completed",
                    title="Welcome to GrokFlow",
                    body="Seed data đã sẵn sàng. Đăng nhập bằng admin/editor/viewer@<host>.",
                    target_url="/dashboard", severity="info",
                ),
            ])
            print("    + 3 notifications")

        await db.commit()

    print()
    print("=" * 60)
    print("DEMO DATA READY")
    print("=" * 60)
    print(f"All demo passwords: {DEMO_PASSWORD}")
    print()
    print("Tenants:")
    for host in DEMO_HOSTNAMES:
        print(f"  http://{host}:5173")
        print(f"    admin@{host}     (admin role, full pages)")
        print(f"    editor@{host}    (Editor role, scoped pages)")
        print(f"    viewer@{host}    (Viewer role, read-only)")
    print()
    print("Super admin (unchanged):")
    print("  admin@local.test / ChangeMe123!  → super_admin")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
