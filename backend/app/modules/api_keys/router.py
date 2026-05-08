import uuid
from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound, PermissionDenied
from app.core.security import generate_api_key
from app.models import ApiKey
from app.modules.audit import service as audit

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
