"""/api/admin/invoices — admin CRUD over Invoice rows.

Manual invoicing path. Status transitions (draft→issued→paid) auto-set
the corresponding timestamp.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import NotFound
from app.models import Invoice, User
from app.modules.admin.audit import service as audit
from app.modules.admin.schemas import (
    AdminInvoiceCreate,
    AdminInvoiceOut,
    AdminInvoiceUpdate,
)
from app.modules.admin.services.serializers import (
    inv_with_email,
    invs_to_out,
)
from app.modules.admin.services.tenancy import (
    assert_billing_owner_in_admin_domain,
    scope_to_admin_domain,
)

router = APIRouter()


@router.get("/invoices", response_model=list[AdminInvoiceOut])
async def list_invoices(
    admin: AdminUser, db: DbSession,
    status_filter: str | None = None, user_id: uuid.UUID | None = None,
) -> list[AdminInvoiceOut]:
    q = scope_to_admin_domain(select(Invoice), Invoice.user_id, admin)
    if status_filter:
        q = q.where(Invoice.status == status_filter)
    if user_id:
        q = q.where(Invoice.user_id == user_id)
    q = q.order_by(Invoice.created_at.desc()).limit(500)
    rows = list((await db.execute(q)).scalars().all())
    return await invs_to_out(db, rows)


@router.post("/invoices", response_model=AdminInvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice_admin(
    payload: AdminInvoiceCreate, admin: AdminUser, db: DbSession,
) -> AdminInvoiceOut:
    """Manually issue an invoice (e.g. for cash sales or post-hoc invoicing)."""
    from app.modules.landing.billing.service import next_invoice_number

    if not await db.get(User, payload.user_id):
        raise NotFound("user")
    await assert_billing_owner_in_admin_domain(db, admin, payload.user_id)
    inv_no = await next_invoice_number(db)
    total = payload.amount + payload.tax
    now = datetime.now(timezone.utc)
    inv = Invoice(
        user_id=payload.user_id,
        subscription_id=payload.subscription_id,
        payment_id=payload.payment_id,
        invoice_number=inv_no,
        amount=payload.amount, tax=payload.tax, total=total,
        currency=payload.currency, status=payload.status,
        issued_at=now if payload.status != "draft" else None,
        paid_at=now if payload.status == "paid" else None,
        line_items=payload.line_items, billing_info=payload.billing_info,
    )
    db.add(inv)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_invoice",
        target_type="invoice", target_id=inv.id,
        metadata={"invoice_number": inv_no, "user_id": str(payload.user_id), "total": float(total)},
    )
    await db.commit()
    await db.refresh(inv)
    return await inv_with_email(db, inv)


@router.patch("/invoices/{invoice_id}", response_model=AdminInvoiceOut)
async def update_invoice_admin(
    invoice_id: uuid.UUID, payload: AdminInvoiceUpdate,
    admin: AdminUser, db: DbSession,
) -> AdminInvoiceOut:
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise NotFound("invoice")
    await assert_billing_owner_in_admin_domain(db, admin, inv.user_id)
    changes: dict = {}
    if payload.amount is not None:
        inv.amount = payload.amount; changes["amount"] = float(payload.amount)
    if payload.tax is not None:
        inv.tax = payload.tax; changes["tax"] = float(payload.tax)
    if payload.amount is not None or payload.tax is not None:
        inv.total = inv.amount + inv.tax
    if payload.status is not None:
        inv.status = payload.status
        changes["status"] = payload.status
        if payload.status == "paid" and not inv.paid_at:
            inv.paid_at = datetime.now(timezone.utc)
        if payload.status == "issued" and not inv.issued_at:
            inv.issued_at = datetime.now(timezone.utc)
    if payload.paid_at is not None:
        inv.paid_at = payload.paid_at
    if payload.line_items is not None:
        inv.line_items = payload.line_items
    if payload.billing_info is not None:
        inv.billing_info = payload.billing_info
    if payload.pdf_url is not None:
        inv.pdf_url = payload.pdf_url
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_invoice",
        target_type="invoice", target_id=inv.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(inv)
    return await inv_with_email(db, inv)


@router.delete("/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice_admin(
    invoice_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> None:
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise NotFound("invoice")
    await assert_billing_owner_in_admin_domain(db, admin, inv.user_id)
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_invoice",
        target_type="invoice", target_id=inv.id,
        metadata={"invoice_number": inv.invoice_number},
    )
    await db.delete(inv)
    await db.commit()
