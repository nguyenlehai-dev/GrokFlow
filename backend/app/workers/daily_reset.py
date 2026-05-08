"""Daily reset worker.

Run as cron at 00:00 UTC:

    python -m app.workers.daily_reset

Resets `api_keys.used_today = 0` and (Phase 4) cleans up old files.
"""

import asyncio

from sqlalchemy import update

from app.core.database import SessionLocal
from app.models import ApiKey


async def main() -> None:
    async with SessionLocal() as db:
        result = await db.execute(update(ApiKey).values(used_today=0))
        await db.commit()
        print(f"[daily_reset] reset {result.rowcount} api keys")


if __name__ == "__main__":
    asyncio.run(main())
