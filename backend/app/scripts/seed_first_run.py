"""First-run bootstrap for self-hosted installs.

Runs once at install time (compose `init` service). Idempotent — re-running
is a no-op so it's safe to leave wired into every startup.

Creates, if missing:
  1. A default wildcard domain (`hostname='*'`) — required so any localhost
     access resolves to a valid tenant config (the resolver falls back to
     this row when no exact hostname match is found).
  2. A super_admin user using INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD
     from the environment. If those vars are unset, we generate a strong
     password and print it to stdout — installer scripts capture and show
     it to the customer.

Env vars consumed:
  INITIAL_ADMIN_EMAIL    — default: admin@local
  INITIAL_ADMIN_PASSWORD — default: auto-generated 16-char alphanumeric
  INITIAL_DOMAIN_LABEL   — default: "Local Install"
"""
from __future__ import annotations

import asyncio
import os
import secrets
import string
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Domain, User


def _gen_password(n: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def main() -> None:
    admin_email = os.environ.get("INITIAL_ADMIN_EMAIL", "admin@local").strip().lower()
    admin_password_env = os.environ.get("INITIAL_ADMIN_PASSWORD", "").strip()
    domain_label = os.environ.get("INITIAL_DOMAIN_LABEL", "Local Install").strip()

    generated_pw: str | None = None
    if not admin_password_env:
        generated_pw = _gen_password()
        admin_password = generated_pw
    else:
        admin_password = admin_password_env

    async with SessionLocal() as db:
        # ── 1. Wildcard domain ─────────────────────────────────────────
        existing_dom = (await db.execute(
            select(Domain).where(Domain.hostname == "*")
        )).scalar_one_or_none()
        if not existing_dom:
            db.add(Domain(
                hostname="*",
                label=domain_label,
                description="Auto-created on first run (self-hosted install).",
                status="active",
                allow_landing=True,
                allow_register=False,  # Self-host: only admin-invited users.
                allow_login=True,
                allow_all_pages=True,
            ))
            print(f"[seed] created default domain '*' label='{domain_label}'", flush=True)
        else:
            print("[seed] default domain '*' already exists — skip", flush=True)

        # ── 2. Super-admin user ────────────────────────────────────────
        existing_admin = (await db.execute(
            select(User).where(User.email == admin_email)
        )).scalar_one_or_none()

        if existing_admin:
            print(f"[seed] admin user '{admin_email}' already exists — skip", flush=True)
        else:
            db.add(User(
                email=admin_email,
                password_hash=hash_password(admin_password),
                full_name="Administrator",
                role="super_admin",
                status="active",
            ))
            await db.commit()
            print(f"[seed] created super_admin '{admin_email}'", flush=True)
            # Stdout banner so install scripts can capture + display.
            if generated_pw:
                print("", flush=True)
                print("=" * 60, flush=True)
                print("  INITIAL ADMIN CREDENTIALS — save these now!", flush=True)
                print(f"    URL:      http://localhost", flush=True)
                print(f"    Email:    {admin_email}", flush=True)
                print(f"    Password: {generated_pw}", flush=True)
                print("=" * 60, flush=True)
                print("", flush=True)
            return

        await db.commit()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[seed] FAILED: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
