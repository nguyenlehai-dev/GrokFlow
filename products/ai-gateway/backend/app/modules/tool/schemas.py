"""Pydantic schemas for /api/prompt-templates and /api/chat-sessions."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Categories the prompt library understands. Frontend renders one tab
# per category. Keep in sync with the dashboard tile mapping.
PromptCategory = Literal["text", "image", "video", "code", "other"]
# Scope of a prompt — derived from (user_id, domain_id) but exposed
# as a friendly enum in API responses.
PromptScope = Literal["system", "domain", "user"]


# ─── Prompt templates ───────────────────────────────────────────────────────


class PromptTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    category: PromptCategory = "text"
    tags: list[str] = Field(default_factory=list)
    thumbnail_url: str | None = None
    is_public: bool = False
    # Super_admin can target system (None+None) or any domain by passing
    # `domain_id`; everyone else gets their own user_id forced server-side.
    domain_id: uuid.UUID | None = None
    # Super_admin only — if true, persist as system template (user_id=NULL,
    # domain_id=NULL). Ignored for non-super.
    system: bool = False


class PromptTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    category: PromptCategory | None = None
    tags: list[str] | None = None
    thumbnail_url: str | None = None
    is_public: bool | None = None


class PromptTemplateOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    domain_id: uuid.UUID | None
    scope: PromptScope
    title: str
    content: str
    category: str
    tags: list[str]
    thumbnail_url: str | None
    is_public: bool
    usage_count: int
    created_at: datetime
    updated_at: datetime


# ─── Chat sessions ──────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    ts: datetime | None = None


class ChatSessionListOut(BaseModel):
    """Slim row for the sidebar list — drops `messages` payload."""
    id: uuid.UUID
    title: str
    model: str | None
    total_tokens: int
    total_cost_cents: int
    message_count: int
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailOut(ChatSessionListOut):
    messages: list[ChatMessage]


class ChatSessionCreate(BaseModel):
    title: str | None = None
    model: str = Field(default="gemini-1.5-flash", max_length=120)


class ChatSendIn(BaseModel):
    content: str = Field(min_length=1)
    # Override model per-message (e.g. switch from Gemini to GPT-4 mid-chat).
    model: str | None = None
