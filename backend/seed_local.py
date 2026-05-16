"""Local-dev bootstrap — populate a fresh SQLite database.

Run once after pointing DATABASE_URL at a sqlite+aiosqlite URL:

    set DATABASE_URL=sqlite+aiosqlite:///./local.db
    python seed_local.py

What it does:
  1. create_all() — skip alembic, just stamp every model's CREATE TABLE
  2. seed the default Plan (so login + entitlements work)
  3. seed a super_admin user (admin@local / Admin@123456)
  4. seed one Server row pointing at 192.168.1.16 with the prod password
     (only meaningful when the local network can reach that IP)

Idempotent — safe to re-run.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.encryption import encrypt
from app.core.security import hash_password
from app.models import Plan, Server, User


LOCAL_ADMIN_EMAIL = "admin@local.test"
LOCAL_ADMIN_PASSWORD = "Admin@123456"


async def main() -> int:
    # 1. Create all tables from SQLAlchemy metadata. We bypass alembic here
    # because local dev runs on SQLite and not every migration is dialect-
    # portable; this gives us the same schema the latest model code expects.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("OK tables created")

    async with SessionLocal() as db:
        # 2. Default plan
        existing = (await db.execute(select(Plan).where(Plan.code == "free"))).scalar_one_or_none()
        if not existing:
            db.add(Plan(
                code="free", name="Free",
                description="Local dev default plan.",
                is_default=True, sort_order=0, is_active=True,
                entitlements={"features": {}, "limits": {}},
            ))
            await db.commit()
            print("OK plan 'free' seeded")
        else:
            print("· plan 'free' already exists")

        # 3. Super-admin user
        u = (await db.execute(
            select(User).where(User.email == LOCAL_ADMIN_EMAIL)
        )).scalar_one_or_none()
        if not u:
            db.add(User(
                email=LOCAL_ADMIN_EMAIL,
                password_hash=hash_password(LOCAL_ADMIN_PASSWORD),
                full_name="Local Super Admin",
                role="super_admin",
                status="active",
            ))
            await db.commit()
            print(f"OK super_admin seeded: {LOCAL_ADMIN_EMAIL} / {LOCAL_ADMIN_PASSWORD}")
        else:
            print(f"· super_admin already exists: {LOCAL_ADMIN_EMAIL}")

        # 4. One server row pointing at the VPS so the /servers UI has
        # something to show. SSH password is the same one set on the host
        # earlier — change after deploying via PATCH /api/admin/servers/{id}.
        s = (await db.execute(
            select(Server).where(Server.hostname == "192.168.1.16")
        )).scalar_one_or_none()
        if not s:
            db.add(Server(
                label="vps",
                hostname="192.168.1.16",
                ssh_user="vpsroot",
                ssh_password_encrypted=encrypt("123456789"),
                ssh_port=22,
                description="Ubuntu 24.04 — primary VPS.",
                status="unknown",
                tags=["prod", "primary"],
            ))
            await db.commit()
            print("OK server vps@192.168.1.16 seeded")
        else:
            print("· server vps@192.168.1.16 already exists")

    print("\nDone. Login at http://localhost:5173/")
    print(f"  email: {LOCAL_ADMIN_EMAIL}")
    print(f"  password: {LOCAL_ADMIN_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
