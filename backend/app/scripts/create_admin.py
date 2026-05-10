"""Create or upsert a user. Usage:

    python -m app.scripts.create_admin --email admin@local --password ChangeMe123!
    python -m app.scripts.create_admin --email user@local --password ChangeMe123! --role user
"""

import argparse
import asyncio

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import User


async def main(email: str, password: str, full_name: str | None, role: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.password_hash = hash_password(password)
            user.role = role
            user.status = "active"
            print(f"updated {role} user {email}")
        else:
            user = User(
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=role,
                status="active",
            )
            db.add(user)
            print(f"created {role} user {email}")
        await db.commit()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--full-name", default=None)
    p.add_argument("--role", default="admin", choices=["admin", "user"])
    args = p.parse_args()
    asyncio.run(main(args.email, args.password, args.full_name, args.role))
