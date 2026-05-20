"""Bootstrap script — copy GrokFlow monorepo files into the
plxeditor-studio standalone scaffold. Runs from
`standalone/plxeditor-studio/` as cwd.

Usage:
    cd standalone/plxeditor-studio
    python _bootstrap.py

plxeditor-studio product surface: branded all-in-one editor —
Grok image/video generation + Flow video post-processing (cut /
merge / audio / frames) sharing one admin shell + gallery. NO
LLM API gateway — that's the ai-gateway repo.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MONOREPO = HERE.parent.parent
DEST_BACKEND = HERE / "backend"
DEST_FRONTEND = HERE / "frontend"

BACKEND_KEEP = [
    # Core infra
    "app/core",
    "app/models/__init__.py",
    "app/models/_base.py",
    "app/models/auth.py",
    "app/models/admin.py",
    "app/models/grok.py",
    "app/models/flow.py",
    "app/models/billing.py",
    "app/models/tool_install.py",
    # Shared (would-be grokflow-core)
    "app/modules/auth",
    "app/modules/admin/__init__.py",
    "app/modules/admin/router.py",
    "app/modules/admin/schemas.py",
    "app/modules/admin/routers/__init__.py",
    "app/modules/admin/routers/entitlements.py",
    "app/modules/admin/routers/invoices.py",
    "app/modules/admin/routers/payments.py",
    "app/modules/admin/routers/plans.py",
    "app/modules/admin/routers/stats.py",
    "app/modules/admin/routers/subscriptions.py",
    "app/modules/admin/routers/system_heal.py",
    "app/modules/admin/routers/users.py",
    "app/modules/admin/services",
    "app/modules/admin/audit",
    "app/modules/admin/dashboard",
    "app/modules/admin/domains",
    "app/modules/admin/gallery",
    "app/modules/admin/notifications",
    "app/modules/admin/roles",
    "app/modules/admin/settings",
    "app/modules/admin/tools",
    "app/modules/entitlements",
    "app/modules/landing/__init__.py",
    "app/modules/landing/billing",
    "app/modules/landing/plans_public",
    # plxeditor-studio product surface
    "app/modules/grok",
    "app/modules/flow",
    "app/modules/landing/client_api",
    "app/modules/landing/public_v1",
    "app/modules/auth/api_keys",
    # Grok runtime
    "app/services",
    "app/browser",
    "app/providers/__init__.py",
    "app/providers/base.py",
    "app/providers/grok_provider.py",
    "app/providers/grok_api_client.py",
    "app/providers/_inspect.py",
    "app/workers",
    "app/storage",
    # Top-level
    "app/main.py",
    "app/core/module_registry.py",
    "alembic.ini",
    "alembic",
    "Dockerfile.prod",
    "entrypoint.sh",
    "pyproject.toml",
    "requirements.txt",
]

FRONTEND_KEEP = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
    "index.html",
    "nginx.conf",
    "Dockerfile.prod",
    "src/main.tsx",
    "src/vite-env.d.ts",
    "src/assets",
    "src/core",
    "src/app",
    "src/components",
    "src/modules/auth",
    "src/modules/admin",
    "src/modules/grok",
    "src/modules/flow",
    "src/modules/landing",
    "helper",
]

SKIP_PATTERNS = [
    "__pycache__",
    ".pytest_cache",
    "node_modules",
    ".turbo",
    "dist",
    "build",
    "*.pyc",
]

# Gateway + Servers + admin_modules out — out of scope for the studio
# product. Keep tool_install for tenant FK scoping but no UI.
BACKEND_DROP = [
    "app/modules/gateway",
    "app/modules/tool",
    "app/modules/servers",
    "app/modules/sdk",
    "app/modules/admin_modules",
    "app/modules/admin/git_admin",
    "app/modules/landing/public_try",
]

FRONTEND_DROP = [
    "src/modules/gateway",
    "src/modules/tool",
    "src/modules/tool_distribution",
    "src/modules/servers",
    "src/modules/admin/views/AdminModulesPage.tsx",
    "src/modules/admin/views/AdminModuleIframePage.tsx",
    "src/modules/admin/views/AdminGitPage.tsx",
    "src/modules/admin/services/modules.service.ts",
]


def should_skip(path: Path) -> bool:
    parts = path.parts
    for pat in SKIP_PATTERNS:
        if pat.startswith("*"):
            if any(p.endswith(pat[1:]) for p in parts):
                return True
        elif pat in parts:
            return True
    return False


def is_dropped(rel: str, drops: list[str]) -> bool:
    rel_p = rel.replace("\\", "/")
    for drop in drops:
        if rel_p == drop or rel_p.startswith(drop + "/"):
            return True
    return False


def copy_tree(src: Path, dst: Path, drops: list[str], stats: dict, mono_root: Path) -> None:
    if src.is_file():
        if should_skip(src):
            stats["dropped"] += 1
            return
        rel_check = src.relative_to(mono_root).as_posix()
        if is_dropped(rel_check, drops):
            stats["dropped"] += 1
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        stats["copied"] += 1
        return
    for item in src.rglob("*"):
        if not item.is_file():
            continue
        if should_skip(item):
            stats["dropped"] += 1
            continue
        try:
            rel_check = item.relative_to(mono_root).as_posix()
        except ValueError:
            rel_check = item.name
        if is_dropped(rel_check, drops):
            stats["dropped"] += 1
            continue
        target = dst / item.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, target)
        stats["copied"] += 1


def main() -> int:
    if not (MONOREPO / "backend" / "app").exists():
        print(f"ERROR: monorepo not found at {MONOREPO}", file=sys.stderr)
        return 1

    print(f"Source: {MONOREPO}")
    print(f"Dest:   {HERE}")
    print()

    backend_stats = {"copied": 0, "dropped": 0}
    print("=== BACKEND ===")
    for entry in BACKEND_KEEP:
        src = MONOREPO / "backend" / entry
        dst = DEST_BACKEND / entry
        if not src.exists():
            print(f"  ! missing: {entry}")
            continue
        copy_tree(src, dst, BACKEND_DROP, backend_stats, MONOREPO / "backend")
    print("  -> copied %d files, dropped %d" % (backend_stats['copied'], backend_stats['dropped']))
    print()

    frontend_stats = {"copied": 0, "dropped": 0}
    print("=== FRONTEND ===")
    for entry in FRONTEND_KEEP:
        src = MONOREPO / "frontend" / entry
        dst = DEST_FRONTEND / entry
        if not src.exists():
            print(f"  ! missing: {entry}")
            continue
        copy_tree(src, dst, FRONTEND_DROP, frontend_stats, MONOREPO / "frontend")
    print("  -> copied %d files, dropped %d" % (frontend_stats['copied'], frontend_stats['dropped']))
    print()

    print("DONE: backend %d files, frontend %d files" % (
        backend_stats['copied'], frontend_stats['copied'],
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
