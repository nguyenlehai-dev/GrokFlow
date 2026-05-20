"""Daily reset worker.

Run as cron at 00:00 UTC:

    python -m app.workers.daily_reset

Resets `api_keys.used_today = 0` and (Phase 4) cleans up old files.
"""

import asyncio

from sqlalchemy import update

from app.core.database import SessionLocal
from app.models import ApiKey, GwGatewayKey


async def main() -> None:
    async with SessionLocal() as db:
        a = await db.execute(update(ApiKey).values(used_today=0))
        # Gateway keys (LLM gateway) also have a daily counter — reset same way.
        g = await db.execute(update(GwGatewayKey).values(used_today=0))
        await db.commit()
        print(f"[daily_reset] reset {a.rowcount} api_keys + {g.rowcount} gw_gateway_keys")


if __name__ == "__main__":
    asyncio.run(main())
