"""Admin oversight for the Tool module.

Lives at `/api/admin/tool/*` — super_admin can:
  - list every prompt template across all users/domains
  - bulk delete prompts (e.g. spam cleanup)
  - audit every chat session (read-only detail view)
  - delete abusive chat sessions
  - see aggregate usage stats

This is intentionally a SEPARATE router from the user-facing
`/api/prompt-templates` and `/api/chat-sessions` — those enforce per-user
visibility rules and are noisy with scope checks. Admin oversight is a
distinct surface; tangling it into the user endpoints would make the
visibility predicate unreadable.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.core.security import hash_password
from app.models import ChatSession, Plan, PromptTemplate, User

from .prompts_router import _serialize as _serialize_prompt
from .schemas import ChatSessionDetailOut, PromptTemplateOut


router = APIRouter(prefix="/api/admin/tool", tags=["admin-tool"])


# ─── Prompt templates oversight ─────────────────────────────────────────────


class AdminPromptOut(PromptTemplateOut):
    """Adds owner email for the admin table — useful when scope=user
    so the admin can see whose prompt they're looking at."""
    owner_email: str | None = None


@router.get("/prompts", response_model=list[AdminPromptOut])
async def admin_list_prompts(
    _: SuperAdminUser, db: DbSession,
    scope: str | None = Query(default=None, pattern="^(system|domain|user)$"),
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, le=500),
) -> list[AdminPromptOut]:
    stmt = select(PromptTemplate, User.email).join(
        User, PromptTemplate.user_id == User.id, isouter=True,
    )
    if scope == "system":
        stmt = stmt.where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.is_(None))
    elif scope == "domain":
        stmt = stmt.where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.isnot(None))
    elif scope == "user":
        stmt = stmt.where(PromptTemplate.user_id.isnot(None))
    if category:
        stmt = stmt.where(PromptTemplate.category == category)
    if q:
        stmt = stmt.where(PromptTemplate.title.ilike(f"%{q}%"))
    if user_id:
        stmt = stmt.where(PromptTemplate.user_id == user_id)
    stmt = stmt.order_by(PromptTemplate.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).all()
    out: list[AdminPromptOut] = []
    for p, email in rows:
        base = _serialize_prompt(p)
        out.append(AdminPromptOut(**base.model_dump(), owner_email=email))
    return out


@router.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def admin_delete_prompt(
    prompt_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> None:
    p = await db.get(PromptTemplate, prompt_id)
    if not p:
        raise NotFound("prompt_template")
    await db.delete(p)
    await db.commit()


# ─── Chat sessions oversight ────────────────────────────────────────────────


class AdminChatSessionRow(ChatSessionDetailOut):
    owner_email: str | None = None


@router.get("/chat-sessions", response_model=list[AdminChatSessionRow])
async def admin_list_chat_sessions(
    _: SuperAdminUser, db: DbSession,
    user_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, description="Search title"),
    limit: int = Query(default=100, le=500),
) -> list[AdminChatSessionRow]:
    stmt = select(ChatSession, User.email).join(User, ChatSession.user_id == User.id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    if q:
        stmt = stmt.where(ChatSession.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(ChatSession.updated_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).all()
    out: list[AdminChatSessionRow] = []
    for s, email in rows:
        out.append(AdminChatSessionRow(
            id=s.id, title=s.title, model=s.model,
            total_tokens=s.total_tokens, total_cost_cents=s.total_cost_cents,
            message_count=len(s.messages or []),
            messages=list(s.messages or []),
            created_at=s.created_at, updated_at=s.updated_at,
            owner_email=email,
        ))
    return out


@router.get("/chat-sessions/{session_id}", response_model=AdminChatSessionRow)
async def admin_get_chat_session(
    session_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> AdminChatSessionRow:
    row = (await db.execute(
        select(ChatSession, User.email)
        .join(User, ChatSession.user_id == User.id)
        .where(ChatSession.id == session_id)
    )).first()
    if not row:
        raise NotFound("chat_session")
    s, email = row
    return AdminChatSessionRow(
        id=s.id, title=s.title, model=s.model,
        total_tokens=s.total_tokens, total_cost_cents=s.total_cost_cents,
        message_count=len(s.messages or []),
        messages=list(s.messages or []),
        created_at=s.created_at, updated_at=s.updated_at,
        owner_email=email,
    )


@router.delete("/chat-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def admin_delete_chat_session(
    session_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> None:
    s = await db.get(ChatSession, session_id)
    if not s:
        raise NotFound("chat_session")
    await db.delete(s)
    await db.commit()


# ─── Customers (per-user Tool provisioning) ─────────────────────────────────
#
# A "customer" here = an end-user account that gets to use the desktop Tool
# app. Mechanically it's just a `users` row with role=user. This page
# focuses the user-management UX around the Tool product:
#   - quick view of which accounts you've provisioned
#   - per-user usage roll-up (chat sessions, prompts created)
#   - quick create with plan assignment
#   - status toggle (suspend without deleting data)
# Domain admins can manage their own customers if you add domain scoping
# later; for now this is super_admin only since pricing/plans are global.


class ToolCustomerOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    status: str
    plan_id: uuid.UUID | None
    plan_code: str | None
    plan_name: str | None
    domain_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # Tool-specific usage counters — handy for support / billing checks
    chat_session_count: int
    prompt_count: int


class ToolCustomerCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    plan_id: uuid.UUID | None = None
    domain_id: uuid.UUID | None = None


class ToolCustomerUpdate(BaseModel):
    full_name: str | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    plan_id: uuid.UUID | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


async def _serialize_customer(db, u: User) -> ToolCustomerOut:
    chat_count = (await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.user_id == u.id)
    )).scalar() or 0
    prompt_count = (await db.execute(
        select(func.count(PromptTemplate.id)).where(PromptTemplate.user_id == u.id)
    )).scalar() or 0
    plan = u.plan if u.plan_id else None
    return ToolCustomerOut(
        id=u.id, email=u.email, full_name=u.full_name, status=u.status,
        plan_id=u.plan_id,
        plan_code=plan.code if plan else None,
        plan_name=plan.name if plan else None,
        domain_id=u.domain_id,
        created_at=u.created_at, updated_at=u.updated_at,
        chat_session_count=chat_count, prompt_count=prompt_count,
    )


@router.get("/customers", response_model=list[ToolCustomerOut])
async def admin_list_customers(
    _: SuperAdminUser, db: DbSession,
    q: str | None = Query(default=None, description="Search email / name"),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(active|inactive)$"),
    limit: int = Query(default=200, le=500),
) -> list[ToolCustomerOut]:
    # Only show role=user — admins/super_admins are managed via /admin/users.
    # This keeps the Tool customers list focused on end-customers.
    stmt = select(User).where(User.role == "user")
    if q:
        like = f"%{q}%"
        stmt = stmt.where((User.email.ilike(like)) | (User.full_name.ilike(like)))
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    stmt = stmt.order_by(User.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize_customer(db, u) for u in rows]


@router.post("/customers", response_model=ToolCustomerOut, status_code=status.HTTP_201_CREATED)
async def admin_create_customer(
    payload: ToolCustomerCreate, _: SuperAdminUser, db: DbSession,
) -> ToolCustomerOut:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")
    if payload.plan_id and not await db.get(Plan, payload.plan_id):
        raise InvalidPayload("Plan không tồn tại")
    u = User(
        email=str(payload.email).lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="user",
        status="active",
        plan_id=payload.plan_id,
        domain_id=payload.domain_id,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return await _serialize_customer(db, u)


@router.patch("/customers/{customer_id}", response_model=ToolCustomerOut)
async def admin_update_customer(
    customer_id: uuid.UUID, payload: ToolCustomerUpdate,
    _: SuperAdminUser, db: DbSession,
) -> ToolCustomerOut:
    u = await db.get(User, customer_id)
    if not u or u.role != "user":
        raise NotFound("customer")
    if payload.full_name is not None:
        u.full_name = payload.full_name
    if payload.status is not None:
        u.status = payload.status
    if payload.plan_id is not None:
        if not await db.get(Plan, payload.plan_id):
            raise InvalidPayload("Plan không tồn tại")
        u.plan_id = payload.plan_id
    if payload.password is not None:
        u.password_hash = hash_password(payload.password)
    await db.commit()
    await db.refresh(u)
    return await _serialize_customer(db, u)


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def admin_delete_customer(
    customer_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> None:
    # Soft delete by marking inactive — keeps their chat history + prompts
    # so support can still investigate. Hard delete must go through the
    # main /admin/users endpoint which cascades properly.
    u = await db.get(User, customer_id)
    if not u or u.role != "user":
        raise NotFound("customer")
    u.status = "inactive"
    await db.commit()


# ─── Stats ──────────────────────────────────────────────────────────────────


class ToolStatsOut(BaseModel):
    customer_count_total: int
    customer_count_active: int
    prompt_count_total: int
    prompt_count_system: int
    prompt_count_domain: int
    prompt_count_user: int
    chat_session_count: int
    chat_message_count: int  # best-effort: sum of len(messages)
    chat_tokens_total: int
    chat_cost_cents_total: int
    top_prompts: list[PromptTemplateOut]


@router.get("/stats", response_model=ToolStatsOut)
async def admin_tool_stats(
    _: SuperAdminUser, db: DbSession,
) -> ToolStatsOut:
    cust_total = (await db.execute(
        select(func.count(User.id)).where(User.role == "user")
    )).scalar() or 0
    cust_active = (await db.execute(
        select(func.count(User.id)).where(User.role == "user", User.status == "active")
    )).scalar() or 0
    prompt_total = (await db.execute(select(func.count(PromptTemplate.id)))).scalar() or 0
    prompt_system = (await db.execute(
        select(func.count(PromptTemplate.id))
        .where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.is_(None))
    )).scalar() or 0
    prompt_domain = (await db.execute(
        select(func.count(PromptTemplate.id))
        .where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.isnot(None))
    )).scalar() or 0
    prompt_user = (await db.execute(
        select(func.count(PromptTemplate.id))
        .where(PromptTemplate.user_id.isnot(None))
    )).scalar() or 0
    chat_count = (await db.execute(select(func.count(ChatSession.id)))).scalar() or 0
    tokens = (await db.execute(select(func.coalesce(func.sum(ChatSession.total_tokens), 0)))).scalar() or 0
    cost = (await db.execute(select(func.coalesce(func.sum(ChatSession.total_cost_cents), 0)))).scalar() or 0

    # Approximate message count by loading just messages JSON (cheap on
    # small datasets; if this grows we should denormalize a counter).
    sessions = (await db.execute(select(ChatSession.messages))).scalars().all()
    msg_count = sum(len(m or []) for m in sessions)

    top = (await db.execute(
        select(PromptTemplate)
        .order_by(PromptTemplate.usage_count.desc())
        .limit(10)
    )).scalars().all()

    return ToolStatsOut(
        customer_count_total=cust_total,
        customer_count_active=cust_active,
        prompt_count_total=prompt_total,
        prompt_count_system=prompt_system,
        prompt_count_domain=prompt_domain,
        prompt_count_user=prompt_user,
        chat_session_count=chat_count,
        chat_message_count=msg_count,
        chat_tokens_total=tokens,
        chat_cost_cents_total=cost,
        top_prompts=[_serialize_prompt(p) for p in top],
    )
