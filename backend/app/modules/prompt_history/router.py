"""/api/prompt-history — per-user recent prompts, server-synced.

Replaces the localStorage-based history that leaked prompts between
accounts on the same browser/Electron install. Each user owns their
list; submitting the same prompt twice updates the existing row's
timestamp (UPSERT) instead of duplicating.

Trim policy: client keeps the list short (max 50 entries per user) by
calling DELETE when the list grows; server doesn't auto-prune.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFound
from app.models import PromptHistory

router = APIRouter(prefix="/api/prompt-history", tags=["prompt-history"])

# Hard cap so a runaway client can't bloat the table for one user. List
# returns at most this many; insert prunes oldest beyond this.
MAX_PER_USER = 50


class PromptHistoryOut(BaseModel):
    id: uuid.UUID
    prompt: str
    job_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class PromptHistoryIn(BaseModel):
    """Used by frontend's `rememberPrompt()` — called right after a
    successful job submit. Server upserts so re-submitting the same
    prompt bumps it to the top instead of duplicating."""
    prompt: str = Field(min_length=1, max_length=16000)
    job_type: str = Field(min_length=1, max_length=50)


@router.get("", response_model=list[PromptHistoryOut])
async def list_history(
    user: CurrentUser, db: DbSession,
    job_type: str | None = Query(default=None, description="Filter by job_type (image/video/chat)"),
    limit: int = Query(default=20, ge=1, le=MAX_PER_USER),
) -> list[PromptHistory]:
    """Return the user's most-recent prompts, newest first.
    Optional `job_type` filter so the create-image modal only sees
    image prompts (avoid mixing video prompts into image suggestions)."""
    stmt = select(PromptHistory).where(PromptHistory.user_id == user.id)
    if job_type:
        stmt = stmt.where(PromptHistory.job_type == job_type)
    stmt = stmt.order_by(PromptHistory.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post("", response_model=PromptHistoryOut, status_code=status.HTTP_201_CREATED)
async def add_history(
    payload: PromptHistoryIn, user: CurrentUser, db: DbSession,
) -> PromptHistory:
    """Upsert: same (user, prompt) bumps the timestamp; new prompt creates
    a row. Also trims excess rows above MAX_PER_USER so the user's history
    stays bounded — oldest entries fall off as new ones arrive."""
    trimmed = payload.prompt.strip()
    # PG ON CONFLICT to upsert in one round-trip without a SELECT first.
    stmt = pg_insert(PromptHistory).values(
        user_id=user.id,
        prompt=trimmed,
        job_type=payload.job_type,
    ).on_conflict_do_update(
        constraint="uq_prompt_history_user_prompt",
        set_={"created_at": datetime.utcnow(), "job_type": payload.job_type},
    ).returning(PromptHistory)
    row = (await db.execute(stmt)).scalar_one()

    # Trim oldest rows above the cap. Cheap because of the
    # ix_prompt_history_user_created index — top-N is an index scan.
    excess = (await db.execute(
        select(PromptHistory.id)
        .where(PromptHistory.user_id == user.id)
        .order_by(PromptHistory.created_at.desc())
        .offset(MAX_PER_USER)
    )).scalars().all()
    if excess:
        await db.execute(
            delete(PromptHistory).where(PromptHistory.id.in_(excess))
        )

    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_one(
    entry_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> None:
    row = await db.get(PromptHistory, entry_id)
    if not row or row.user_id != user.id:
        raise NotFound("prompt history entry")
    await db.delete(row)
    await db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def clear_all(user: CurrentUser, db: DbSession) -> None:
    """Wipe the user's entire history. Triggered by "Xoá tất cả" button."""
    await db.execute(delete(PromptHistory).where(PromptHistory.user_id == user.id))
    await db.commit()
