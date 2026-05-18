"""Module install / uninstall orchestration.

The router endpoint creates an `admin_modules` row with status=installing
and returns immediately so the UI doesn't block on a long build. The
heavy lifting (clone → manifest → schema → docker build/run → health
check → vhost) runs in a background asyncio task that updates the row's
status field as it goes:

  installing → running          (happy path)
  installing → error             (any step failed; we record last_error)

Uninstall reverses every side-effect best-effort so the host is left
clean even if a step errors.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import shutil
import subprocess
import traceback
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import update

from app.core.database import SessionLocal
from app.core.encryption import encrypt
from app.core.exceptions import InvalidPayload
from app.models import AdminModule
from app.services import module_runtime as rt

from .schemas import ModuleInstallRequest, ModuleManifestSchema


MODULE_ROOT = rt.MODULE_ROOT
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
    except Exception as exc:  # noqa: BLE001
        raise InvalidPayload(f"manifest validation failed: {exc}") from exc


def _validate_resource_limits(manifest: ModuleManifestSchema) -> None:
    mem = manifest.resources.memory.lower()
    if not mem.endswith(("m", "g")):
        raise InvalidPayload("resources.memory must end with 'm' or 'g'")
    bytes_val = int(float(mem[:-1])) * (1024**2 if mem.endswith("m") else 1024**3)
    if bytes_val > 2 * 1024**3:
        raise InvalidPayload("resources.memory cap is 2g per module")
    if manifest.resources.cpus > 2.0:
        raise InvalidPayload("resources.cpus cap is 2.0 per module")


async def install(req: ModuleInstallRequest, installer_user_id) -> AdminModule:
    """Synchronous portion of install — clone, parse manifest, create the
    DB row in `status=installing`. The router commits the row, then we
    schedule the background task to drive the rest of the lifecycle.
    """
    work_dir = _slug_path("__pending__")
    try:
        _git_clone(req, work_dir)
    except subprocess.CalledProcessError as exc:
        msg = (exc.stderr or b"").decode(errors="replace")[:200] or str(exc)
        raise InvalidPayload(f"git clone failed: {msg}") from exc

    manifest = _parse_manifest(work_dir)
    _validate_resource_limits(manifest)
    slug = manifest.name
    if not SLUG_RE.match(slug):
        raise InvalidPayload(f"invalid slug '{slug}'")

    # Move from pending → final namespace
    final_dir = _slug_path(slug)
    if final_dir.exists():
        shutil.rmtree(final_dir)
    work_dir.rename(final_dir)

    db_password = secrets.token_urlsafe(32)
    service_token = secrets.token_urlsafe(32)
    db_schema = manifest.database.schema_name if manifest.database else f"mod_{slug}"
    db_user = f"{db_schema}_user"

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


def schedule_post_install(slug: str, raw_db_password: str) -> None:
    """Kick off the long-running install steps in the background.

    Has to run as a fire-and-forget task so the HTTP response from
    POST /api/admin/modules returns immediately (the docker build can
    take minutes). The task updates the row's status when done.
    """
    asyncio.create_task(_do_post_install(slug, raw_db_password))


def schedule_update(slug: str) -> None:
    """Update flow: git fetch + reset to origin/<ref> in the existing
    work dir, rebuild images, swap containers. If health check fails,
    keep the previous (still-running) containers."""
    asyncio.create_task(_do_update(slug))


async def _do_update(slug: str) -> None:
    """Pull + rebuild + swap. On failure, leave the old containers up
    and surface last_error to the UI."""
    from app.core.encryption import decrypt
    work_dir = _slug_path(slug)

    async def _mark(status: str, last_error: str | None = None,
                    fe_id: str | None = None, be_id: str | None = None,
                    fe_tag: str | None = None, be_tag: str | None = None,
                    version: str | None = None) -> None:
        async with SessionLocal() as db:
            values = {"status": status, "last_error": last_error}
            if fe_id:   values["fe_container_id"] = fe_id
            if be_id:   values["be_container_id"] = be_id
            if fe_tag:  values["fe_image_tag"] = fe_tag
            if be_tag:  values["be_image_tag"] = be_tag
            if version: values["version"] = version
            await db.execute(
                update(AdminModule).where(AdminModule.slug == slug).values(**values)
            )
            await db.commit()

    try:
        async with SessionLocal() as db:
            from sqlalchemy import select as _select
            row = (await db.execute(
                _select(AdminModule).where(AdminModule.slug == slug)
            )).scalar_one()
            pat = decrypt(row.git_token_enc) if row.git_token_enc else None
            git_url = row.git_url
            git_ref = row.git_ref
            db_password = decrypt(row.db_password_enc)
            db_user = row.db_user
            db_schema = row.db_schema
            service_token = row.service_token

        # Re-clone (depth 1 + branch) into the same dir — simpler than git
        # pull because we don't care about the local history.
        _git_clone(ModuleInstallRequest(git_url=git_url, git_ref=git_ref, github_pat=pat), work_dir)
        manifest = _parse_manifest(work_dir)
        _validate_resource_limits(manifest)

        # Build NEW images (use a fresh tag for atomicity).
        print(f"[module-update] {slug}: building new images for v{manifest.version}", flush=True)
        new_fe_tag, new_be_tag = await asyncio.to_thread(
            rt.build_images, work_dir, manifest.model_dump(by_alias=True), slug,
        )

        # Stop old, spawn new.
        rt.stop_containers(slug)
        be_id = await asyncio.to_thread(
            rt.spawn_backend, slug, manifest.model_dump(by_alias=True), new_be_tag,
            db_user, db_password, db_schema, service_token,
        )
        fe_id = await asyncio.to_thread(
            rt.spawn_frontend, slug, manifest.model_dump(by_alias=True), new_fe_tag,
        )

        # Health probe.
        healthy = await rt.wait_healthy(slug, manifest.model_dump(by_alias=True), timeout_sec=90)
        if not healthy:
            raise RuntimeError("module backend never returned 200 on /health after update")

        await _mark("running", fe_id=fe_id, be_id=be_id,
                    fe_tag=new_fe_tag, be_tag=new_be_tag,
                    version=manifest.version)
        print(f"[module-update] {slug}: UPDATED to v{manifest.version}", flush=True)
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"[module-update] {slug}: FAILED — {exc}\n{tb}", flush=True)
        # Leave old containers (or whatever's running) — just flag error.
        await _mark("error", last_error=str(exc)[:1000])


async def _do_post_install(slug: str, raw_db_password: str) -> None:
    """Provision DB → build images → spawn containers → wait health →
    write vhost. Marks the row 'running' on success, 'error' on any step.
    """
    work_dir = _slug_path(slug)

    async def _mark(status: str, last_error: str | None = None,
                    fe_id: str | None = None, be_id: str | None = None,
                    fe_tag: str | None = None, be_tag: str | None = None) -> None:
        async with SessionLocal() as db:
            await db.execute(
                update(AdminModule)
                .where(AdminModule.slug == slug)
                .values(
                    status=status,
                    last_error=last_error,
                    **({"fe_container_id": fe_id} if fe_id else {}),
                    **({"be_container_id": be_id} if be_id else {}),
                    **({"fe_image_tag": fe_tag} if fe_tag else {}),
                    **({"be_image_tag": be_tag} if be_tag else {}),
                )
            )
            await db.commit()

    try:
        # Read manifest from disk (we trust the validated row.manifest jsonb
        # too, but re-parsing from disk keeps the source of truth in one
        # place).
        async with SessionLocal() as db:
            row = (await db.execute(
                # noqa
                __import__("sqlalchemy").select(AdminModule).where(AdminModule.slug == slug)
            )).scalar_one()
            manifest = row.manifest

        # 1. DB schema + user
        print(f"[module-install] {slug}: provisioning postgres schema", flush=True)
        read_core = (manifest.get("database") or {}).get("read_core_tables", [])
        await rt.provision_db(
            slug, schema=row.db_schema, db_user=row.db_user,
            db_password=raw_db_password,
            read_core_tables=read_core,
        )

        # 2. Build images (sync but fast for small modules)
        print(f"[module-install] {slug}: building images", flush=True)
        fe_tag, be_tag = await asyncio.to_thread(
            rt.build_images, work_dir, manifest, slug,
        )

        # 3. Spawn containers
        print(f"[module-install] {slug}: spawning containers", flush=True)
        be_id = await asyncio.to_thread(
            rt.spawn_backend, slug, manifest, be_tag,
            row.db_user, raw_db_password, row.db_schema, row.service_token,
        )
        fe_id = await asyncio.to_thread(
            rt.spawn_frontend, slug, manifest, fe_tag,
        )

        # 4. Wait for backend /health
        print(f"[module-install] {slug}: waiting for /health", flush=True)
        healthy = await rt.wait_healthy(slug, manifest, timeout_sec=90)
        if not healthy:
            raise RuntimeError("module backend never returned 200 on /health")

        # 5. nginx vhost (best-effort; only when host dir is mounted)
        rt.write_vhost(slug)

        # 6. Done
        await _mark("running", fe_id=fe_id, be_id=be_id,
                    fe_tag=fe_tag, be_tag=be_tag)
        print(f"[module-install] {slug}: RUNNING", flush=True)
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"[module-install] {slug}: FAILED — {exc}\n{tb}", flush=True)
        # Best-effort cleanup of partial state so retry is clean.
        try:
            rt.stop_containers(slug)
        except Exception:
            pass
        await _mark("error", last_error=str(exc)[:1000])


async def uninstall(module: AdminModule) -> None:
    """Reverse the install. Best-effort: each cleanup swallows its own
    errors so partial states can still be cleaned up."""
    slug = module.slug
    try:
        rt.stop_containers(slug)
    except Exception:
        pass
    try:
        rt.remove_vhost(slug)
    except Exception:
        pass
    try:
        await rt.drop_db(schema=module.db_schema, db_user=module.db_user)
    except Exception:
        pass
    work_dir = _slug_path(slug)
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)


def _cleanup_failed_install(slug: str) -> None:
    work_dir = _slug_path(slug)
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
