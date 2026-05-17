"""Tool module — branded dashboard for super_admin's GROK VIP TOOL.

Wraps existing features (jobs, flow, gallery) with a dark-purple skin
and adds two new persistent surfaces:

  - prompt_templates: reusable prompt library (system/domain/user scopes)
  - chat_sessions:    ChatGPT-style multi-turn conversations
"""
from fastapi import APIRouter

from app.core.module_registry import ModuleManifest

from .admin_router import router as admin_router
from .chat_router import router as chat_router
from .prompts_router import router as prompts_router

# Combine routers into one manifest — they share the same module
# directory and lifecycle. Keeps the OpenAPI tag list tidy.
_combined = APIRouter()
_combined.include_router(prompts_router)
_combined.include_router(chat_router)
_combined.include_router(admin_router)

manifest = ModuleManifest(
    name="tool",
    label="Tool — Prompt library + Chat sessions",
    router=_combined,
    tags=("tool",),
)
