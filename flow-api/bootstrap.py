"""One-shot bootstrap: ensure an admin user + API key exist on first boot.

Reads env vars:
  FLOW_BOOTSTRAP_EMAIL
  FLOW_BOOTSTRAP_USERNAME
  FLOW_BOOTSTRAP_PASSWORD
  FLOW_BOOTSTRAP_API_KEY_NAME    (default: "default")

After creating the API key the plaintext value is written to
/app/data/.api-key — the GrokFlow backend container reads this file on
startup so the user never has to copy-paste secrets manually.

Re-running is a no-op (idempotent): we exit early if the user already exists.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    email = os.getenv("FLOW_BOOTSTRAP_EMAIL", "").strip()
    username = os.getenv("FLOW_BOOTSTRAP_USERNAME", "").strip()
    password = os.getenv("FLOW_BOOTSTRAP_PASSWORD", "").strip()
    key_name = os.getenv("FLOW_BOOTSTRAP_API_KEY_NAME", "default").strip()

    if not (email and username and password):
        print("[bootstrap] FLOW_BOOTSTRAP_* env vars not set — skipping")
        return 0

    # Import inside main so a missing DB doesn't blow up at module import.
    from app.db.base import Base
    from app.db.session import SessionLocal, engine
    from app.models import ApiKey, Job, User  # noqa: F401  (table registration)
    from app.services import api_key_service, user_service

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = user_service.get_user_by_email(db, email)
        if existing:
            print(f"[bootstrap] user {email} exists — no action")
            return 0

        is_first = user_service.get_users_count(db) == 0
        user = user_service.create_user(
            db=db,
            email=email,
            username=username,
            password=password,
            full_name="Flow Admin",
            is_admin=is_first,
        )
        print(f"[bootstrap] created user {email} (admin={is_first})")

        api_key = api_key_service.create_api_key(db, key_name, user.id)
        # ApiKeyCreatedResponse exposes the plaintext key once via
        # `api_key.key` (the model field) before it's hashed.
        plaintext = getattr(api_key, "key", None) or getattr(api_key, "raw_key", None)
        if not plaintext:
            print("[bootstrap] WARNING: api_key service did not return plaintext")
            return 0

        # Persist for the GrokFlow backend to read.
        out = Path("/app/data/.api-key")
        out.write_text(plaintext.strip(), encoding="utf-8")
        out.chmod(0o600)
        print(f"[bootstrap] wrote API key to {out}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
