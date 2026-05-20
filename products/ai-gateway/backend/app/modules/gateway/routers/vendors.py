"""/api/v1/gateway/vendors — super_admin CRUD over upstream LLM vendors."""

import uuid

from fastapi import APIRouter, status as http_status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import GwVendor
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s

router = APIRouter()


@router.get("/vendors", response_model=list[s.VendorOut])
async def list_vendors(admin: AdminUser, db: DbSession) -> list[GwVendor]:
    rows = (await db.execute(select(GwVendor).order_by(GwVendor.name))).scalars().all()
    return list(rows)


@router.post("/vendors", response_model=s.VendorOut, status_code=http_status.HTTP_201_CREATED)
async def create_vendor(payload: s.VendorIn, admin: SuperAdminUser, db: DbSession) -> GwVendor:
    existing = (await db.execute(
        select(GwVendor).where(GwVendor.code == payload.code)
    )).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Vendor code '{payload.code}' đã tồn tại")
    v = GwVendor(**payload.model_dump())
    db.add(v)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="gw_create_vendor",
        target_type="gw_vendor", target_id=v.id, metadata={"code": payload.code},
    )
    await db.commit()
    await db.refresh(v)
    return v


@router.patch("/vendors/{vendor_id}", response_model=s.VendorOut)
async def update_vendor(
    vendor_id: uuid.UUID, payload: s.VendorUpdate, admin: SuperAdminUser, db: DbSession,
) -> GwVendor:
    v = await db.get(GwVendor, vendor_id)
    if not v:
        raise NotFound("vendor")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(v, field, value)
    await audit.log_action(
        db, user_id=admin.id, action="gw_update_vendor",
        target_type="gw_vendor", target_id=v.id,
    )
    await db.commit()
    await db.refresh(v)
    return v


@router.delete("/vendors/{vendor_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_vendor(vendor_id: uuid.UUID, admin: SuperAdminUser, db: DbSession):
    v = await db.get(GwVendor, vendor_id)
    if not v:
        raise NotFound("vendor")
    await audit.log_action(
        db, user_id=admin.id, action="gw_delete_vendor",
        target_type="gw_vendor", target_id=v.id, metadata={"code": v.code},
    )
    await db.delete(v)
    await db.commit()
