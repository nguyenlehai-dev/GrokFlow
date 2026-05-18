"""Prompt template CRUD with three-tier scope.

A user sees:
  - All `system` templates (user_id NULL, domain_id NULL) — owned globally
  - Their own templates (user_id == self.id)
  - Other templates in their domain (domain_id == self.domain_id, is_public=true)

Mutations:
  - Anyone can create personal (user_id forced to self).
  - Domain admin can create domain-scoped (user_id NULL, domain_id self.domain_id).
  - Super_admin can create system (system=true, user_id NULL, domain_id NULL)
    or any domain (pass domain_id).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status
from sqlalchemy import and_, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound, PermissionDenied
from app.models import PromptTemplate

from .schemas import (
    PromptTemplateCreate,
    PromptTemplateOut,
    PromptTemplateUpdate,
)

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"])


def _scope_of(p: PromptTemplate) -> str:
    """Derive friendly scope label from (user_id, domain_id)."""
    if p.user_id is None and p.domain_id is None:
        return "system"
    if p.user_id is None and p.domain_id is not None:
        return "domain"
    return "user"


def _serialize(p: PromptTemplate) -> PromptTemplateOut:
    return PromptTemplateOut(
        id=p.id, user_id=p.user_id, domain_id=p.domain_id,
        scope=_scope_of(p),
        title=p.title, content=p.content, category=p.category,
        tags=list(p.tags or []), thumbnail_url=p.thumbnail_url,
        is_public=p.is_public, usage_count=p.usage_count,
        created_at=p.created_at, updated_at=p.updated_at,
    )


@router.get("", response_model=list[PromptTemplateOut])
async def list_prompts(
    user: CurrentUser, db: DbSession,
    category: str | None = Query(default=None),
    scope: str | None = Query(default=None, pattern="^(system|domain|user|all)$"),
    q: str | None = Query(default=None, description="Search title substring"),
    limit: int = Query(default=50, le=200),
) -> list[PromptTemplateOut]:
    """Visible-to-user resolution. `scope` filters the union further:
       system  → system-only;  domain → domain-only;  user → own-only;
       all     → everything user can see.  Default: all."""
    # Visibility predicate.
    visibility = or_(
        and_(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.is_(None)),
        PromptTemplate.user_id == user.id,
        and_(
            PromptTemplate.user_id.is_(None),
            PromptTemplate.domain_id == user.domain_id,
            PromptTemplate.is_public.is_(True),
        ) if user.domain_id else PromptTemplate.id.is_(None),
    )
    stmt = select(PromptTemplate).where(visibility)
    if category:
        stmt = stmt.where(PromptTemplate.category == category)
    if q:
        stmt = stmt.where(PromptTemplate.title.ilike(f"%{q}%"))
    if scope == "system":
        stmt = stmt.where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.is_(None))
    elif scope == "domain":
        stmt = stmt.where(PromptTemplate.user_id.is_(None), PromptTemplate.domain_id.isnot(None))
    elif scope == "user":
        stmt = stmt.where(PromptTemplate.user_id == user.id)
    stmt = stmt.order_by(PromptTemplate.usage_count.desc(), PromptTemplate.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


@router.post("", response_model=PromptTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    payload: PromptTemplateCreate, user: CurrentUser, db: DbSession,
) -> PromptTemplateOut:
    is_super = user.role == "super_admin"
    is_admin = user.role in ("admin", "super_admin")

    # Resolve (user_id, domain_id) from payload + caller role.
    if payload.system and is_super:
        scope_user_id, scope_domain_id = None, None
    elif payload.domain_id is not None:
        if not is_admin:
            raise PermissionDenied("Only admin / super_admin can create domain-scoped templates")
        if not is_super and payload.domain_id != user.domain_id:
            raise PermissionDenied("Cannot create templates for other domains")
        scope_user_id, scope_domain_id = None, payload.domain_id
    else:
        # Personal template — always tied to caller.
        scope_user_id, scope_domain_id = user.id, None

    p = PromptTemplate(
        user_id=scope_user_id, domain_id=scope_domain_id,
        title=payload.title.strip(), content=payload.content,
        category=payload.category, tags=payload.tags,
        thumbnail_url=payload.thumbnail_url, is_public=payload.is_public,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.get("/{prompt_id}", response_model=PromptTemplateOut)
async def get_prompt(
    prompt_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> PromptTemplateOut:
    p = await db.get(PromptTemplate, prompt_id)
    if not p:
        raise NotFound("prompt_template")
    # Visibility check
    if p.user_id is None and p.domain_id is None:
        pass  # system — public
    elif p.user_id == user.id:
        pass  # own
    elif p.domain_id == user.domain_id and p.is_public:
        pass  # same-domain public
    elif user.role == "super_admin":
        pass  # super sees all
    else:
        raise NotFound("prompt_template")
    return _serialize(p)


@router.patch("/{prompt_id}", response_model=PromptTemplateOut)
async def update_prompt(
    prompt_id: uuid.UUID, payload: PromptTemplateUpdate,
    user: CurrentUser, db: DbSession,
) -> PromptTemplateOut:
    p = await db.get(PromptTemplate, prompt_id)
    if not p:
        raise NotFound("prompt_template")
    # Edit perm: owner OR super_admin OR (domain template + domain admin).
    if user.role == "super_admin":
        pass
    elif p.user_id == user.id:
        pass
    elif (
        p.user_id is None and p.domain_id == user.domain_id
        and user.role == "admin"
    ):
        pass
    else:
        raise PermissionDenied("Cannot edit this template")

    for field in ("title", "content", "category", "thumbnail_url", "is_public"):
        v = getattr(payload, field)
        if v is not None:
            setattr(p, field, v.strip() if isinstance(v, str) else v)
    if payload.tags is not None:
        p.tags = payload.tags
    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_prompt(
    prompt_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> None:
    p = await db.get(PromptTemplate, prompt_id)
    if not p:
        raise NotFound("prompt_template")
    if user.role == "super_admin" or p.user_id == user.id:
        pass
    elif (
        p.user_id is None and p.domain_id == user.domain_id
        and user.role == "admin"
    ):
        pass
    else:
        raise PermissionDenied("Cannot delete this template")
    await db.delete(p)
    await db.commit()


@router.post("/{prompt_id}/use", response_model=PromptTemplateOut)
async def use_prompt(
    prompt_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> PromptTemplateOut:
    """Bump usage_count + return content. Frontend calls this when the
    user clicks 'Use template' so popular prompts bubble to the top."""
    p = await db.get(PromptTemplate, prompt_id)
    if not p:
        raise NotFound("prompt_template")
    # Visibility = same as get_prompt
    if not (
        (p.user_id is None and p.domain_id is None)
        or p.user_id == user.id
        or (p.domain_id == user.domain_id and p.is_public)
        or user.role == "super_admin"
    ):
        raise NotFound("prompt_template")
    p.usage_count += 1
    await db.commit()
    await db.refresh(p)
    return _serialize(p)
