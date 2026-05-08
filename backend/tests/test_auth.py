import pytest


@pytest.mark.asyncio
async def test_login_success(client, user):
    res = await client.post("/api/auth/login", json={"email": "user@test", "password": "Secret123!"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client, user):
    res = await client.post("/api/auth/login", json={"email": "user@test", "password": "wrong"})
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_me_requires_token(client):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client, user):
    login = await client.post("/api/auth/login", json={"email": "user@test", "password": "Secret123!"})
    token = login.json()["access_token"]
    res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "user@test"
