"""Saved GitHub PAT CRUD + reuse helpers.

Admins paste a PAT once in the install / Create flow, tick "Save for
reuse", and on later installs pick from a dropdown instead of re-pasting.
The plaintext token is never returned through any API endpoint.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.deps import DbSession, SuperAdminUser
from app.core.encryption import decrypt, encrypt
from app.core.exceptions import InvalidPayload, NotFound
from app.models import GitHubPAT


router = APIRouter(prefix="/api/admin/github-pats", tags=["admin-github-pats"])


class GitHubPATCreate(BaseModel):
    label: str
    token: str


class GitHubPATOut(BaseModel):
    """Public DTO — never includes the token plaintext."""
    id: UUID
    label: str
    github_user: str | None
    created_at: datetime
    last_used_at: datetime | None

    class Config:
        from_attributes = True


async def _probe_github_user(token: str) -> str | None:
    """Resolve the PAT to a GitHub login so the saved row shows who the
    token belongs to. Best-effort — returns None on any failure."""
    try:
        async with httpx.AsyncClient(base_url="https://api.github.com", timeout=8.0) as c:
            r = await c.get("/user", headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            })
            if r.status_code == 200:
                return r.json().get("login")
    except Exception:
        return None
    return None


@router.get("", response_model=list[GitHubPATOut])
async def list_pats(_admin: SuperAdminUser, db: DbSession) -> list[GitHubPAT]:
    rows = (await db.execute(
        select(GitHubPAT).order_by(GitHubPAT.created_at.desc())
    )).scalars().all()
    return list(rows)


@router.post("", response_model=GitHubPATOut, status_code=status.HTTP_201_CREATED)
async def save_pat(
    payload: GitHubPATCreate, admin: SuperAdminUser, db: DbSession,
) -> GitHubPAT:
    token = payload.token.strip()
    if not token:
        raise InvalidPayload("token is required")
    github_user = await _probe_github_user(token)
    row = GitHubPAT(
        label=payload.label.strip() or (github_user or "Unnamed"),
        github_user=github_user,
        token_enc=encrypt(token),
        created_by=admin.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{pat_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_pat(pat_id: UUID, _admin: SuperAdminUser, db: DbSession) -> None:
    row = await db.get(GitHubPAT, pat_id)
    if not row:
        raise NotFound("github pat")
    await db.delete(row)
    await db.commit()


# ─── Internal resolution helper (used by install / create endpoints) ──


async def resolve_pat(db, *, saved_pat_id: UUID | None, inline_pat: str | None) -> str | None:
    """Used by install / create flows. Accepts EITHER a saved-pat UUID
    OR an inline raw PAT. Returns the decrypted token (or None if neither
    is provided). Updates `last_used_at` on the saved row."""
    if saved_pat_id is not None:
        row = await db.get(GitHubPAT, saved_pat_id)
        if not row:
            raise NotFound("github pat")
        # Bump last_used_at without committing — caller will commit anyway.
        await db.execute(
            update(GitHubPAT).where(GitHubPAT.id == saved_pat_id)
            .values(last_used_at=datetime.now(timezone.utc))
        )
        return decrypt(row.token_enc)
    if inline_pat:
        return inline_pat.strip() or None
    return None
