import pytest


async def _login(client, email, password):
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_create_and_list_api_key(client, user):
    token = await _login(client, "user@test", "Secret123!")
    h = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/api-keys",
        headers=h,
        json={"name": "Test", "allowed_providers": ["grok"], "allowed_job_types": ["image"], "daily_limit": 100},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["api_key"].startswith("uxpm_live_")
    assert body["warning"]

    listed = await client.get("/api/api-keys", headers=h)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    # api_key plaintext NOT returned by list endpoint
    assert "api_key" not in listed.json()[0]


@pytest.mark.asyncio
async def test_revoke_api_key(client, user):
    token = await _login(client, "user@test", "Secret123!")
    h = {"Authorization": f"Bearer {token}"}
    res = await client.post(
        "/api/api-keys", headers=h,
        json={"name": "K", "allowed_providers": ["grok"], "allowed_job_types": ["image"]},
    )
    kid = res.json()["id"]
    rev = await client.patch(f"/api/api-keys/{kid}/revoke", headers=h)
    assert rev.status_code == 200
    assert rev.json()["status"] == "revoked"
