#!/usr/bin/env bash
# bootstrap_users.sh — one-shot reset of admin + user accounts on the VPS.
#
# Idempotent: re-running will reset passwords + force status=active. Use this
# whenever you're locked out or want to ensure known credentials.
#
# Usage:  bash deploy/bootstrap_users.sh
#
# Edit the credentials block below if you want different ones.

set -euo pipefail

cd "$(dirname "$0")/.."

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@grokflow.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345}"
USER_EMAIL="${USER_EMAIL:-user@grokflow.local}"
USER_PASSWORD="${USER_PASSWORD:-User12345}"

DC="docker compose --env-file .env.prod -f docker-compose.intranet.yml"

echo "==> Bootstrapping users on this VPS"
echo "    admin: $ADMIN_EMAIL"
echo "    user : $USER_EMAIL"
echo

# Inline Python so this works on any backend image regardless of the version
# of create_admin.py (older images don't accept --role).
$DC exec -T \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e USER_EMAIL="$USER_EMAIL" \
  -e USER_PASSWORD="$USER_PASSWORD" \
  backend python <<'PY'
import asyncio
import os
import sys

from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models import User

ACCOUNTS = [
    (os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"], "admin", "Admin"),
    (os.environ["USER_EMAIL"],  os.environ["USER_PASSWORD"],  "user",  "User"),
]


async def main() -> None:
    async with SessionLocal() as db:
        # Snapshot what's already in the DB.
        rows = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
        print(f"--- BEFORE ({len(rows)} users) ---")
        for u in rows:
            print(f"  {u.email!r}  role={u.role}  status={u.status}")
        print()

        for email, pw, role, name in ACCOUNTS:
            r = await db.execute(select(User).where(User.email == email))
            u = r.scalar_one_or_none()
            new_hash = hash_password(pw)
            if u:
                u.password_hash = new_hash
                u.role = role
                u.status = "active"
                action = "RESET"
            else:
                u = User(email=email, password_hash=new_hash,
                         full_name=name, role=role, status="active")
                db.add(u)
                action = "CREATED"
            await db.flush()
            ok = verify_password(pw, u.password_hash)
            if not ok:
                print(f"  !! VERIFY FAILED for {email}", file=sys.stderr)
                sys.exit(1)
            print(f"  [{action}] {email}  role={u.role}  verify=OK")

        await db.commit()

    print()
    print(">>> done. you can now log in with:")
    for email, pw, _, _ in ACCOUNTS:
        print(f"    {email} / {pw}")


asyncio.run(main())
PY

echo
echo "==> bootstrap done."
