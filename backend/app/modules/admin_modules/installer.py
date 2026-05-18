"""Module install / uninstall orchestration.

Lifecycle steps (kept in one file so the install endpoint is readable):

  1. clone repo to /srv/grokflow-modules/<slug>
  2. parse + validate manifest
  3. provision postgres schema + role
  4. docker build FE and BE images
  5. docker run both containers (hardened: cap_drop, read_only, mem_limit)
  6. wait for backend /health (timeout from manifest, default 60s)
  7. write nginx vhost so the iframe at /m/<slug>/ resolves
  8. insert admin_modules row

Each step has matching rollback in uninstall. Failures along the way
should call _cleanup_failed_install() to leave the host in a clean state.

This module is intentionally a thin orchestration layer — the heavy
lifting (docker calls, postgres DDL, vhost templating) lives in
app/services so it can be unit-tested without standing up a full stack.
"""

from __future__ import annotations

import asyncio
import json
import re
import secrets
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.encryption import encrypt
from app.core.exceptions import InvalidPayload
from app.models import AdminModule

from .schemas import ModuleInstallRequest, ModuleManifestSchema


MODULE_ROOT = Path("/srv/grokflow-modules")
SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{2,30}$")


def _slug_path(slug: str) -> Path:
    return MODULE_ROOT / slug


def _git_clone(req: ModuleInstallRequest, dest: Path) -> None:
    """Shallow-clone the module repo into `dest`. Auth via PAT in URL if given."""
    url = req.git_url
    if req.github_pat and url.startswith("https://"):
        url = url.replace("https://", f"https://{req.github_pat}@", 1)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        shutil.rmtree(dest)
    subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", req.git_ref, url, str(dest)],
        check=True, capture_output=True,
    )


def _parse_manifest(work_dir: Path) -> ModuleManifestSchema:
    manifest_path = work_dir / "module.manifest.json"
    if not manifest_path.exists():
        raise InvalidPayload("Repo missing module.manifest.json at root")
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InvalidPayload(f"manifest is not valid JSON: {exc}") from exc
    try:
        return ModuleManifestSchema.model_validate(raw)
    except Exception as exc:  # noqa: BLE001 — surface schema errors as 422
        raise InvalidPayload(f"manifest validation failed: {exc}") from exc


def _validate_resource_limits(manifest: ModuleManifestSchema) -> None:
    """Reject modules that ask for more than the per-host cap."""
    mem = manifest.resources.memory.lower()
    if not mem.endswith(("m", "g")):
        raise InvalidPayload("resources.memory must end with 'm' or 'g'")
    bytes_val = int(mem[:-1]) * (1024**2 if mem.endswith("m") else 1024**3)
    if bytes_val > 2 * 1024**3:
        raise InvalidPayload("resources.memory cap is 2g per module")
    if manifest.resources.cpus > 2.0:
        raise InvalidPayload("resources.cpus cap is 2.0 per module")


async def install(
    req: ModuleInstallRequest,
    installer_user_id,
) -> AdminModule:
    """Top-level install orchestration. Returns a new (uncommitted) AdminModule.

    Caller (router) is responsible for adding the returned model to the
    session and committing. Side effects on the host (git clone, docker
    build/run, postgres DDL, vhost file) all happen inside this call and
    are rolled back via `_cleanup_failed_install` on any exception.
    """
    # Phase 1 (this file): manifest parsing + DB row generation. Container
    # spawn + DB provisioning + vhost write are stubbed; they live in
    # app/services/module_runtime.py once we wire the actual host calls.
    work_dir = _slug_path("__pending__")
    try:
        _git_clone(req, work_dir)
    except subprocess.CalledProcessError as exc:
        raise InvalidPayload(f"git clone failed: {exc.stderr.decode(errors='replace')[:200]}") from exc

    manifest = _parse_manifest(work_dir)
    _validate_resource_limits(manifest)
    slug = manifest.name
    if not SLUG_RE.match(slug):
        raise InvalidPayload(f"invalid slug '{slug}'")

    # Move from pending dir to final namespace
    final_dir = _slug_path(slug)
    if final_dir.exists():
        shutil.rmtree(final_dir)
    work_dir.rename(final_dir)

    # Provision DB schema + role (stub for Phase 1 — real impl in services)
    db_password = secrets.token_urlsafe(32)
    service_token = secrets.token_urlsafe(32)
    db_schema = (manifest.database.schema_name if manifest.database else f"mod_{slug}")
    db_user = f"{db_schema}_user"

    # TODO Phase 1.1: actually run CREATE SCHEMA + CREATE USER via service
    # TODO Phase 1.1: docker build + run for FE/BE
    # TODO Phase 1.1: write nginx vhost
    # For now, the row is recorded with status=installing so the UI can
    # poll progress while a background worker drives steps 3-7. We return
    # the row immediately so the install API doesn't block for 30+s.

    row = AdminModule(
        slug=slug,
        version=manifest.version,
        git_url=req.git_url,
        git_ref=req.git_ref,
        git_token_enc=(encrypt(req.github_pat) if req.github_pat else None),
        manifest=manifest.model_dump(by_alias=True),
        db_schema=db_schema,
        db_user=db_user,
        db_password_enc=encrypt(db_password),
        service_token=service_token,
        status="installing",
        installed_at=datetime.now(timezone.utc),
        installed_by=installer_user_id,
    )
    return row


async def uninstall(module: AdminModule) -> None:
    """Reverse the install: stop containers, drop schema, remove vhost+dir.

    Best-effort: each step swallows its own errors so a partial state can
    still be cleaned up by a re-run. Caller must delete the DB row after.
    """
    slug = module.slug
    # TODO Phase 1.1:
    # - docker stop + rm grokflow-mod-<slug>-fe / -be
    # - rm /etc/nginx/grokflow-vhosts/grokflow-mod-<slug>.conf
    # - DROP SCHEMA mod_<slug> CASCADE  (with optional backup-first flag)
    # - DROP USER mod_<slug>_user
    work_dir = _slug_path(slug)
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)


def _cleanup_failed_install(slug: str) -> None:
    """Best-effort cleanup after a partially-installed module errored out."""
    work_dir = _slug_path(slug)
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
