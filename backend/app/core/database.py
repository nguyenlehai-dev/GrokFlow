from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Connection pool tuning. asyncpg defaults (pool_size=5, max_overflow=10)
# are tight for a gunicorn-with-4-uvicorn-workers prod setup — each worker
# has its own pool, but per-worker bursts during dashboard refreshes (the
# admin dashboard fires ~6 queries in parallel) can starve the pool and
# block requests on `pool.acquire()`. 10+20 per worker gives headroom
# without ballooning total Postgres connections (Postgres max_connections
# is 100 by default → 4 workers × 30 = 120 worst case, still bounded).
#
# pool_pre_ping catches stale connections after Postgres restarts /
# network blips without an obvious "connection closed" error to the user.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_DEBUG,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,  # recycle conns every 30min to dodge stale TCP
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
