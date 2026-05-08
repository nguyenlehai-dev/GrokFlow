import pytest


async def _login(client, email, password):
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_public_create_job_requires_api_key(client):
    res = await client.post("/v1/jobs/image", json={"provider": "grok", "prompt": "x"})
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "invalid_api_key"


@pytest.mark.asyncio
async def test_public_create_job_with_valid_key(client, user, monkeypatch):
    # Stub rate limit so test does not need redis.
    from app.modules.public_v1 import router as pv1
    async def _noop(_):
        return None
    monkeypatch.setattr(pv1, "enforce_api_key_rate_limit", _noop)

    token = await _login(client, "user@test", "Secret123!")
    h = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/api-keys", headers=h,
        json={"name": "K", "allowed_providers": ["grok"], "allowed_job_types": ["image"]},
    )
    plain_key = create.json()["api_key"]

    res = await client.post(
        "/v1/jobs/image",
        headers={"Authorization": f"Bearer {plain_key}"},
        json={"provider": "grok", "prompt": "test"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_public_perm_denied_for_unauthorized_provider(client, user, monkeypatch):
    from app.modules.public_v1 import router as pv1
    async def _noop(_):
        return None
    monkeypatch.setattr(pv1, "enforce_api_key_rate_limit", _noop)

    token = await _login(client, "user@test", "Secret123!")
    h = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/api-keys", headers=h,
        json={"name": "K", "allowed_providers": ["grok"], "allowed_job_types": ["image"]},
    )
    plain_key = create.json()["api_key"]

    res = await client.post(
        "/v1/jobs/image",
        headers={"Authorization": f"Bearer {plain_key}"},
        json={"provider": "flow", "prompt": "test"},
    )
    assert res.status_code == 403
