import uuid
from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import EntitlementBlocked, InvalidPayload, NotFound, PermissionDenied
from app.core.security import generate_api_key, hash_api_key
from app.models import ApiKey, User
from app.modules.admin.audit import service as audit
from app.modules.entitlements.service import (
    get_effective_entitlements,
    get_limit,
)

from .schemas import (
    JOB_TYPES,
    PROVIDERS,
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
)

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(user: CurrentUser, db: DbSession) -> list[ApiKey]:
    result = await db.execute(select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_key(payload: ApiKeyCreate, user: CurrentUser, db: DbSession) -> ApiKeyCreatedOut:
    eff = await get_effective_entitlements(db, user)
    cap = get_limit(eff, "max_api_keys")
    if cap > 0:
        cur = (await db.execute(
            select(func.count(ApiKey.id)).where(
                ApiKey.user_id == user.id, ApiKey.status != "revoked"
            )
        )).scalar_one()
        if cur >= cap:
            raise EntitlementBlocked(
                "max_api_keys_exceeded",
                f"Đã đạt giới hạn {cap} API key của gói. Liên hệ admin để nâng gói.",
            )

    invalid_p = [p for p in payload.allowed_providers if p not in PROVIDERS]
    if invalid_p:
        raise InvalidPayload(f"Unknown providers: {invalid_p}")
    invalid_j = [j for j in payload.allowed_job_types if j not in JOB_TYPES]
    if invalid_j:
        raise InvalidPayload(f"Unknown job_types: {invalid_j}")

    full_key, prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        name=payload.name,
        key_prefix=prefix,
        key_hash=key_hash,
        allowed_providers=payload.allowed_providers,
        allowed_job_types=payload.allowed_job_types,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        daily_limit=payload.daily_limit,
        expires_at=payload.expires_at,
    )
    db.add(api_key)
    await db.flush()
    await audit.log_action(
        db, user_id=user.id, action="create_api_key", target_type="api_key", target_id=api_key.id,
        metadata={"name": api_key.name, "providers": api_key.allowed_providers, "job_types": api_key.allowed_job_types},
    )
    await db.commit()
    await db.refresh(api_key)
    return ApiKeyCreatedOut.model_validate({**ApiKeyOut.model_validate(api_key).model_dump(), "api_key": full_key})


@router.get("/{key_id}", response_model=ApiKeyOut)
async def get_key(key_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ApiKey:
    api_key = await db.get(ApiKey, key_id)
    if not api_key:
        raise NotFound("api_key")
    if api_key.user_id != user.id and user.role != "admin":
        raise PermissionDenied()
    return api_key


@router.patch("/{key_id}/revoke", response_model=ApiKeyOut)
async def revoke_key(key_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ApiKey:
    api_key = await db.get(ApiKey, key_id)
    if not api_key:
        raise NotFound("api_key")
    if api_key.user_id != user.id and user.role != "admin":
        raise PermissionDenied()
    api_key.status = "revoked"
    await audit.log_action(
        db, user_id=user.id, action="revoke_api_key", target_type="api_key", target_id=api_key.id,
    )
    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(key_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    api_key = await db.get(ApiKey, key_id)
    if not api_key:
        raise NotFound("api_key")
    if api_key.user_id != user.id and user.role != "admin":
        raise PermissionDenied()
    await db.delete(api_key)
    await db.commit()


# ─── /verify — used by FE Playground lock modals ────────────────────────
# Mirrors /api/v1/gateway/gateway-keys/verify shape. Caller pastes the raw
# key once; FE persists the verification result locally (zustand + localStorage)
# and uses it as Bearer for subsequent job-creation calls. The endpoint
# itself is auth-less — anyone with the key can verify it (that's the
# whole point of a "do you recognise this key" check).

class ApiKeyVerifyRequest(BaseModel):
    key: str


class ApiKeyVerifyResponse(BaseModel):
    verified: bool
    label: str | None = None
    user_email: str | None = None
    allowed_providers: list[str] | None = None
    allowed_job_types: list[str] | None = None
    daily_limit: int | None = None
    used_today: int | None = None


@router.post("/verify", response_model=ApiKeyVerifyResponse)
async def verify_key(payload: ApiKeyVerifyRequest, db: DbSession) -> ApiKeyVerifyResponse:
    """Return the key's metadata if it's valid + active; { verified: False }
    otherwise. We intentionally don't leak existence by returning 404 —
    same shape as Gateway's verify so the FE can use one mental model."""
    raw = (payload.key or "").strip()
    if not raw:
        return ApiKeyVerifyResponse(verified=False)
    key_hash = hash_api_key(raw)
    api_key = (
        await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    ).scalar_one_or_none()
    if not api_key or api_key.status != "active":
        return ApiKeyVerifyResponse(verified=False)
    user = await db.get(User, api_key.user_id)
    if not user or user.status != "active":
        return ApiKeyVerifyResponse(verified=False)
    return ApiKeyVerifyResponse(
        verified=True,
        label=api_key.name,
        user_email=user.email,
        allowed_providers=list(api_key.allowed_providers or []),
        allowed_job_types=list(api_key.allowed_job_types or []),
        daily_limit=api_key.daily_limit,
        used_today=api_key.used_today,
    )
