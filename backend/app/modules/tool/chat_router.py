"""Chat sessions — multi-turn conversations.

Each send appends the user message, calls a vendor provider (via the
gateway's resolve_pool to pick an active pool + key + the right
vendor), and persists the assistant reply. The conversation history is
flattened into a single prompt string in the format that most chat-
trained models handle well — providers receive `prompt`, not a
messages array, since the current provider protocol pre-dates chat.

Token / cost accounting is best-effort: we read the provider's
normalized `usage_tokens` if returned, else fall back to len/4 heuristics.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.models import ChatSession
from app.modules.gateway.providers import get_provider
from app.modules.gateway.services.execution import resolve_pool

from .schemas import (
    ChatSendIn,
    ChatSessionCreate,
    ChatSessionDetailOut,
    ChatSessionListOut,
)

router = APIRouter(prefix="/api/chat-sessions", tags=["chat-sessions"])


def _flatten(messages: list[dict]) -> str:
    """Join messages into a single prompt for providers without a messages
    array. Role labels prefix each turn so the model knows who said what."""
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            parts.append(f"[System] {content}")
        elif role == "user":
            parts.append(f"User: {content}")
        else:
            parts.append(f"Assistant: {content}")
    parts.append("Assistant:")
    return "\n".join(parts)


def _extract_text(normalized: dict | None) -> str:
    """Pull human-readable text out of the provider's normalized response.
    Different providers shape it differently; handle the common cases."""
    if not normalized:
        return ""
    # Gemini-style: {"candidates": [{"content": {"parts": [{"text": "..."}]}}]}
    cands = normalized.get("candidates")
    if isinstance(cands, list) and cands:
        c = cands[0]
        content = c.get("content") if isinstance(c, dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if isinstance(parts, list):
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            if text:
                return text
    # OpenAI-style: {"choices": [{"message": {"content": "..."}}]}
    choices = normalized.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(msg, dict):
            return msg.get("content", "") or ""
    # Plain text payload
    return normalized.get("text") or normalized.get("output") or ""


def _list_serialize(s: ChatSession) -> ChatSessionListOut:
    return ChatSessionListOut(
        id=s.id, title=s.title, model=s.model,
        total_tokens=s.total_tokens, total_cost_cents=s.total_cost_cents,
        message_count=len(s.messages or []),
        created_at=s.created_at, updated_at=s.updated_at,
    )


def _detail_serialize(s: ChatSession) -> ChatSessionDetailOut:
    return ChatSessionDetailOut(
        id=s.id, title=s.title, model=s.model,
        total_tokens=s.total_tokens, total_cost_cents=s.total_cost_cents,
        message_count=len(s.messages or []),
        messages=list(s.messages or []),
        created_at=s.created_at, updated_at=s.updated_at,
    )


@router.get("", response_model=list[ChatSessionListOut])
async def list_sessions(
    user: CurrentUser, db: DbSession,
    limit: int = Query(default=50, le=200),
) -> list[ChatSessionListOut]:
    rows = (await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )).scalars().all()
    return [_list_serialize(r) for r in rows]


@router.post("", response_model=ChatSessionDetailOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ChatSessionCreate, user: CurrentUser, db: DbSession,
) -> ChatSessionDetailOut:
    s = ChatSession(
        user_id=user.id,
        title=(payload.title or "New chat").strip(),
        model=payload.model,
        messages=[],
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _detail_serialize(s)


@router.get("/{session_id}", response_model=ChatSessionDetailOut)
async def get_session(
    session_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> ChatSessionDetailOut:
    s = await db.get(ChatSession, session_id)
    if not s or s.user_id != user.id:
        raise NotFound("chat_session")
    return _detail_serialize(s)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_session(
    session_id: uuid.UUID, user: CurrentUser, db: DbSession,
) -> None:
    s = await db.get(ChatSession, session_id)
    if not s or s.user_id != user.id:
        raise NotFound("chat_session")
    await db.delete(s)
    await db.commit()


@router.post("/{session_id}/messages", response_model=ChatSessionDetailOut)
async def send_message(
    session_id: uuid.UUID, payload: ChatSendIn,
    user: CurrentUser, db: DbSession,
) -> ChatSessionDetailOut:
    s = await db.get(ChatSession, session_id)
    if not s or s.user_id != user.id:
        raise NotFound("chat_session")

    now = datetime.now(timezone.utc).isoformat()
    user_msg = {"role": "user", "content": payload.content, "ts": now}
    history = list(s.messages or []) + [user_msg]
    model = payload.model or s.model or "gemini-1.5-flash"

    if len(s.messages or []) == 0 and s.title == "New chat":
        s.title = payload.content[:60].strip() or "New chat"

    # Resolve pool → vendor → key. resolve_pool raises if no active pool
    # exists for (function=text_generation, model). Treat as InvalidPayload
    # so the frontend can surface a clean error to the user.
    try:
        fn, pool, vendor, candidates = await resolve_pool(
            db, "text_generation", model,
        )
    except Exception as exc:  # noqa: BLE001
        raise InvalidPayload(
            f"Chưa có pool active cho model '{model}'. Super_admin tạo Pool + Pool API key trước. ({type(exc).__name__})",
        )
    if not candidates:
        raise InvalidPayload(
            f"Pool '{pool.name}' chưa có active API key nào (cooldown / inactive).",
        )

    provider = get_provider(vendor.code)
    if provider is None:
        raise InvalidPayload(f"Vendor '{vendor.code}' chưa có provider impl")

    prompt = _flatten(history)
    last_err: str | None = None
    normalized: dict | None = None
    for key in candidates:
        try:
            normalized = await provider.execute(
                model=model, prompt=prompt,
                reference_image_urls=[], reference_video_urls=[],
                aspect_ratio=None, image_size=None, extra=None,
                api_key=key.api_key, project_id=key.project_id,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            continue

    if normalized is None:
        raise InvalidPayload(f"All keys failed. Last error: {last_err}")

    text = _extract_text(normalized).strip()
    if not text:
        raise InvalidPayload("Provider returned empty response")

    assistant_msg = {
        "role": "assistant",
        "content": text,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    s.messages = history + [assistant_msg]
    s.model = model

    # Best-effort accounting — vendor responses don't all expose token
    # counts in the same shape. Rough heuristic: 4 chars ≈ 1 token.
    usage = normalized.get("usage") or normalized.get("usageMetadata") or {}
    t_in = usage.get("promptTokenCount") or usage.get("prompt_tokens") or len(prompt) // 4
    t_out = usage.get("candidatesTokenCount") or usage.get("completion_tokens") or len(text) // 4
    s.total_tokens += int(t_in) + int(t_out)
    cost_per_million_input = pool.cost_per_million_input_cents or 0
    cost_per_million_output = pool.cost_per_million_output_cents or 0
    cost = (t_in * cost_per_million_input + t_out * cost_per_million_output) // 1_000_000
    s.total_cost_cents += int(cost)

    await db.commit()
    await db.refresh(s)
    return _detail_serialize(s)
