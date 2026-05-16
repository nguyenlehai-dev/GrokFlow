"""/api/v1/gateway/functions — function-template CRUD.

NOTE: The actual /execute and /submit endpoints (which run a function)
live in `execute.py`; this file is just the catalog/admin part.
"""

import uuid

from fastapi import APIRouter, status as http_status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import GwApiFunction
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s

router = APIRouter()


@router.get("/functions", response_model=list[s.ApiFunctionOut])
async def list_functions(admin: AdminUser, db: DbSession) -> list[GwApiFunction]:
    rows = (await db.execute(select(GwApiFunction).order_by(GwApiFunction.name))).scalars().all()
    return list(rows)


@router.post("/functions", response_model=s.ApiFunctionOut, status_code=http_status.HTTP_201_CREATED)
async def create_function(payload: s.ApiFunctionIn, admin: SuperAdminUser, db: DbSession) -> GwApiFunction:
    existing = (await db.execute(
        select(GwApiFunction).where(GwApiFunction.code == payload.code)
    )).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Function code '{payload.code}' đã tồn tại")
    fn = GwApiFunction(**payload.model_dump())
    db.add(fn)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_function",
        target_type="gw_function", target_id=fn.id, metadata={"code": payload.code},
    )
    await db.commit()
    await db.refresh(fn)
    return fn


@router.patch("/functions/{function_id}", response_model=s.ApiFunctionOut)
async def update_function(
    function_id: uuid.UUID, payload: s.ApiFunctionUpdate, admin: SuperAdminUser, db: DbSession,
) -> GwApiFunction:
    fn = await db.get(GwApiFunction, function_id)
    if not fn:
        raise NotFound("function")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(fn, field, value)
    await db.commit()
    await db.refresh(fn)
    return fn


@router.delete("/functions/{function_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_function(function_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
    fn = await db.get(GwApiFunction, function_id)
    if not fn:
        raise NotFound("function")
    await db.delete(fn)
    await db.commit()
