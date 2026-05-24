"""Backend module registry — single source of truth for which feature
modules are loaded into the FastAPI app.

Mirrors the pattern used on the frontend (`frontend/src/app/moduleRegistry.ts`):
each module exports a `ModuleManifest`, and `main.py` mounts them in one
loop instead of importing every router manually.

Why
---
Before this registry, `main.py` carried 24 explicit `from app.modules.X
import router` lines + 24 `app.include_router` calls. Adding a new module
meant remembering to edit two places, in order, and there was no central
place to attach metadata (lifespan hooks, feature flags, sub-module
discovery).

How to add a new module
-----------------------
1. Drop a folder under `backend/app/modules/<name>/`.
2. In its `__init__.py`, export `manifest: ModuleManifest` pointing at the
   module's APIRouter:

       from .router import router
       from app.core.module_registry import ModuleManifest

       manifest = ModuleManifest(
           name="my_thing",
           label="My Thing",
           router=router,
       )

3. Add the module to `MODULES` below.

That's it. No edits to `main.py`. Tests that need only some modules can
filter `MODULES` before calling `register_all`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable

from fastapi import APIRouter, FastAPI


LifespanHook = Callable[[FastAPI], Awaitable[None]]


@dataclass(frozen=True)
class ModuleManifest:
    """Declarative description of a backend feature module.

    Fields
    ------
    name : str
        Stable internal id. Used in logs and as a dedup key.
    label : str
        Human-readable label (docs/admin UI only — not user-facing).
    router : APIRouter
        The module's top-level FastAPI router. Its `prefix` already
        contains the URL prefix (e.g. `/api/admin`); the registry does
        not add anything.
    startup : tuple[LifespanHook, ...]
        Optional async callables run during app startup (after DB is
        reachable). Use for seed data, cache warmup, etc.
    shutdown : tuple[LifespanHook, ...]
        Optional async callables run during app shutdown.
    tags : tuple[str, ...]
        Free-form labels for filtering (e.g. "public", "admin", "billing").
        Tests / docs can use these without hardcoding module names.
    """

    name: str
    label: str
    router: APIRouter
    startup: tuple[LifespanHook, ...] = field(default_factory=tuple)
    shutdown: tuple[LifespanHook, ...] = field(default_factory=tuple)
    tags: tuple[str, ...] = field(default_factory=tuple)


def _load_modules() -> list[ModuleManifest]:
    """Import every module's manifest lazily.

    Imports are local so that a syntax error in one module doesn't take
    out the whole registry import chain — `main.py` will still surface a
    specific traceback pointing at the offending module.
    """
    # ai-gateway standalone — only the multi-LLM gateway product surface
    # + shared core. Grok/Flow live in their own standalone repos.
    from app.modules.auth import manifest as auth
    from app.modules.auth.api_keys import manifest as api_keys
    from app.modules.admin import manifest as admin
    from app.modules.admin.audit import manifest as audit
    from app.modules.admin.dashboard import manifest as dashboard
    from app.modules.admin.domains import manifest as domains
    from app.modules.admin.notifications import manifest as notifications
    from app.modules.admin.roles import manifest as roles
    from app.modules.admin.settings import manifest as settings
    from app.modules.gateway import manifest as gateway
    from app.modules.tool import manifest as tool
    from app.modules.tool_install import manifest as tool_install
    from app.modules.landing.billing import manifest as billing
    from app.modules.landing.plans_public import manifest as plans_public

    # Order preserved to keep OpenAPI tag ordering stable across deploys.
    return [
        # Auth surface
        auth, api_keys,
        # Gateway product (multi-LLM routing — pools, keys, vendors, requests)
        gateway,
        # Tool — chat sessions + prompts (gateway playground UI)
        tool,
        # Tool installs — desktop client registry
        tool_install,
        # Admin & back-office
        admin, dashboard, audit, notifications,
        domains, roles, settings,
        # User-side billing / plan catalog (no partner/grok client API)
        billing, plans_public,
    ]


_MODULES: list[ModuleManifest] | None = None


def get_modules() -> list[ModuleManifest]:
    """Memoised accessor so tests can call this multiple times cheaply."""
    global _MODULES
    if _MODULES is None:
        _MODULES = _load_modules()
    return _MODULES


def register_all(app: FastAPI, modules: Iterable[ModuleManifest] | None = None) -> None:
    """Mount every manifest's router onto the given FastAPI app.

    Pass `modules=` to override (e.g. tests that want only a subset).
    Lifespan hooks declared on manifests are NOT wired here — `main.py`
    composes them into its lifespan context manager so the order between
    DB-touching hooks and the DB-init step stays explicit and visible.
    """
    for m in modules if modules is not None else get_modules():
        app.include_router(m.router)


def collect_startup_hooks(
    modules: Iterable[ModuleManifest] | None = None,
) -> list[LifespanHook]:
    """Flatten startup hooks from all modules, preserving manifest order."""
    out: list[LifespanHook] = []
    for m in modules if modules is not None else get_modules():
        out.extend(m.startup)
    return out


def collect_shutdown_hooks(
    modules: Iterable[ModuleManifest] | None = None,
) -> list[LifespanHook]:
    """Flatten shutdown hooks, preserving manifest order."""
    out: list[LifespanHook] = []
    for m in modules if modules is not None else get_modules():
        out.extend(m.shutdown)
    return out
