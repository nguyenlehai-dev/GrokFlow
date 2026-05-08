"""Pytest fixtures using SQLite in-memory for fast unit-level testing.

For full integration tests against Postgres, use docker-compose service.
"""

import asyncio
import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test_secret_must_be_long_enough_for_dev_use")
os.environ.setdefault("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123=")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import database as db_module
from app.core.security import hash_password
from app.main import app
from app.models import User


# Replace global engine with SQLite for tests.
test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
db_module.engine = test_engine
db_module.SessionLocal = TestSessionLocal


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db():
    async with test_engine.begin() as conn:
        await conn.run_sync(db_module.Base.metadata.drop_all)
        await conn.run_sync(db_module.Base.metadata.create_all)
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def user(db):
    u = User(
        id=uuid.uuid4(),
        email="user@test",
        password_hash=hash_password("Secret123!"),
        role="user",
        status="active",
    )
    db.add(u)
    await db.commit()
    return u


@pytest_asyncio.fixture
async def admin(db):
    u = User(
        id=uuid.uuid4(),
        email="admin@test",
        password_hash=hash_password("Secret123!"),
        role="admin",
        status="active",
    )
    db.add(u)
    await db.commit()
    return u
