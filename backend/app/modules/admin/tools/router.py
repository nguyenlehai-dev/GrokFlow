"""Admin Tool Distribution router — manage downloadable installer files.

  GET    /api/admin/tools                 list tools (+ assets, latest per kind)
  POST   /api/admin/tools                 create a tool (label / code / etc.)
  PATCH  /api/admin/tools/{id}            edit name / description / homepage
  POST   /api/admin/tools/{id}/logo       upload logo image (multipart)
  DELETE /api/admin/tools/{id}            delete tool + cascade assets

  POST   /api/admin/tools/{id}/assets     upload an asset (multipart + meta)
  PATCH  /api/admin/tools/assets/{id}     edit asset metadata (label, version, notes, is_latest)
  DELETE /api/admin/tools/assets/{id}     delete asset

  GET    /api/admin/tools/assets/{id}/download   stream the binary (admin preview)

End-user-facing public download is provided by `app.modules.tool_distribution`
(separate, no auth). This router is the management surface — super_admin only.
"""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, File as FastapiFile, Form, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import InvalidPayload, NotFound
from app.models import File, Tool, ToolAsset
from app.modules.grok.files import service as files_service


router = APIRouter(prefix="/api/admin/tools", tags=["admin-tools"])


ASSET_KINDS = ("win", "mac", "document")


# ─── Schemas ────────────────────────────────────────────────────────────


class ToolAssetOut(BaseModel):
    id: uuid.UUID
    tool_id: uuid.UUID
    kind: str
    label: str
    version: str | None
    file_id: uuid.UUID
    file_name: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    is_latest: bool
    notes: str | None
    download_count: int
    sort_order: int
    # Convenience absolute path the FE can drop into `<a href>` to start
    # a download. Renderer must include the JWT — use `downloadAuthed`
    # helper on the FE which fetches via axios + blob.
    download_url: str

    class Config:
        from_attributes = True


class ToolOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    logo_file_id: uuid.UUID | None
    # Same convenience field as on assets — resolves to the logo download.
    logo_url: str | None
    homepage_url: str | None
    sort_order: int
    assets: list[ToolAssetOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class ToolCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    homepage_url: str | None = Field(default=None, max_length=500)


class ToolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    homepage_url: str | None = Field(default=None, max_length=500)
    sort_order: int | None = Field(default=None, ge=0)


class ToolAssetUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    version: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=8000)
    is_latest: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


# ─── Helpers ────────────────────────────────────────────────────────────


def _asset_download_url(asset_id: uuid.UUID) -> str:
    return f"/api/admin/tools/assets/{asset_id}/download"


def _logo_url(logo_file_id: uuid.UUID | None) -> str | None:
    # Reuse the generic file download endpoint — admin already has auth
    # to read any File row, so no separate logo endpoint needed.
    if logo_file_id is None:
        return None
    return f"/api/files/{logo_file_id}/download"


async def _serialize_asset(db: DbSession, asset: ToolAsset) -> ToolAssetOut:
    f = await db.get(File, asset.file_id)
    return ToolAssetOut(
        id=asset.id, tool_id=asset.tool_id, kind=asset.kind,
        label=asset.label, version=asset.version,
        file_id=asset.file_id,
        file_name=f.file_name if f else None,
        file_size=f.file_size if f else None,
        mime_type=f.mime_type if f else None,
        is_latest=asset.is_latest,
        notes=asset.notes,
        download_count=asset.download_count,
        sort_order=asset.sort_order,
        download_url=_asset_download_url(asset.id),
    )


async def _serialize_tool(db: DbSession, tool: Tool) -> ToolOut:
    asset_rows = (await db.execute(
        select(ToolAsset)
        .where(ToolAsset.tool_id == tool.id)
        .order_by(ToolAsset.kind, ToolAsset.sort_order, ToolAsset.created_at.desc())
    )).scalars().all()
    return ToolOut(
        id=tool.id, code=tool.code, name=tool.name,
        description=tool.description,
        logo_file_id=tool.logo_file_id,
        logo_url=_logo_url(tool.logo_file_id),
        homepage_url=tool.homepage_url,
        sort_order=tool.sort_order,
        assets=[await _serialize_asset(db, a) for a in asset_rows],
    )


# ─── Tool CRUD ──────────────────────────────────────────────────────────


@router.get("", response_model=list[ToolOut])
async def list_tools(_: SuperAdminUser, db: DbSession) -> list[ToolOut]:
    rows = (await db.execute(
        select(Tool).order_by(Tool.sort_order, Tool.created_at.desc())
    )).scalars().all()
    return [await _serialize_tool(db, t) for t in rows]


@router.post("", response_model=ToolOut, status_code=status.HTTP_201_CREATED)
async def create_tool(
    payload: ToolCreate, _: SuperAdminUser, db: DbSession,
) -> ToolOut:
    existing = (await db.execute(
        select(Tool).where(Tool.code == payload.code)
    )).scalar_one_or_none()
    if existing is not None:
        raise InvalidPayload(f"Tool code '{payload.code}' đã tồn tại")
    tool = Tool(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        homepage_url=payload.homepage_url,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return await _serialize_tool(db, tool)


@router.patch("/{tool_id}", response_model=ToolOut)
async def update_tool(
    tool_id: uuid.UUID, payload: ToolUpdate,
    _: SuperAdminUser, db: DbSession,
) -> ToolOut:
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise NotFound("tool")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(tool, k, v)
    await db.commit()
    await db.refresh(tool)
    return await _serialize_tool(db, tool)


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_tool(
    tool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
) -> None:
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise NotFound("tool")
    # Cascade by FK takes care of tool_assets rows. The underlying File
    # rows (logo + asset blobs) stay — they're shared infra, idle_cleanup
    # prunes orphaned ones via FILE_TTL_DAYS.
    await db.delete(tool)
    await db.commit()


@router.post("/{tool_id}/logo", response_model=ToolOut)
async def upload_logo(
    tool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
    file: UploadFile = FastapiFile(...),
) -> ToolOut:
    """Upload (or replace) a tool's logo image."""
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise NotFound("tool")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise InvalidPayload("Chỉ chấp nhận file ảnh")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise InvalidPayload("Logo tối đa 5MB")
    rec = await files_service.save_job_result(
        db,
        user_id=admin.id, job_id=None,
        file_name=file.filename or f"logo-{tool.code}",
        file_type="image",
        mime_type=file.content_type,
        data=data,
    )
    tool.logo_file_id = rec.id
    await db.commit()
    await db.refresh(tool)
    return await _serialize_tool(db, tool)


# ─── Assets CRUD ────────────────────────────────────────────────────────


@router.post("/{tool_id}/assets", response_model=ToolAssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    tool_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
    file: UploadFile = FastapiFile(...),
    kind: Literal["win", "mac", "document"] = Form(...),
    label: str = Form(...),
    version: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    is_latest: bool = Form(default=True),
) -> ToolAssetOut:
    """Upload an installer / doc file and attach it to a tool.

    Setting `is_latest=true` (default) automatically clears the previous
    latest of the same kind for this tool — only one can be marked at a
    time so the FE has a single "Download latest" affordance per bucket."""
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise NotFound("tool")
    if kind not in ASSET_KINDS:
        raise InvalidPayload("kind phải là win | mac | document")
    data = await file.read()
    max_size = 500 * 1024 * 1024  # 500MB cap — installers can be chunky
    if len(data) > max_size:
        raise InvalidPayload("File tối đa 500MB")
    rec = await files_service.save_job_result(
        db,
        user_id=admin.id, job_id=None,
        file_name=file.filename or f"{tool.code}-{kind}",
        file_type="installer" if kind in ("win", "mac") else "document",
        mime_type=file.content_type or "application/octet-stream",
        data=data,
    )
    asset = ToolAsset(
        tool_id=tool.id, kind=kind, label=label, version=version,
        file_id=rec.id, is_latest=is_latest, notes=notes,
    )
    db.add(asset)
    if is_latest:
        # Clear previous latest of this (tool, kind) so only one row carries
        # the flag. Race window is tiny (single request, single connection)
        # — same transaction commits both changes atomically.
        await db.execute(
            update(ToolAsset)
            .where(
                ToolAsset.tool_id == tool.id,
                ToolAsset.kind == kind,
            )
            .values(is_latest=False)
        )
        # Re-set this row's flag (the update above hit it too).
        asset.is_latest = True
    await db.commit()
    await db.refresh(asset)
    return await _serialize_asset(db, asset)


@router.patch("/assets/{asset_id}", response_model=ToolAssetOut)
async def update_asset(
    asset_id: uuid.UUID, payload: ToolAssetUpdate,
    _: SuperAdminUser, db: DbSession,
) -> ToolAssetOut:
    asset = await db.get(ToolAsset, asset_id)
    if not asset:
        raise NotFound("tool_asset")
    data = payload.model_dump(exclude_unset=True)
    promote_latest = data.pop("is_latest", None)
    for k, v in data.items():
        setattr(asset, k, v)
    if promote_latest is True:
        # Demote any other latest in the same (tool, kind) bucket.
        await db.execute(
            update(ToolAsset)
            .where(
                ToolAsset.tool_id == asset.tool_id,
                ToolAsset.kind == asset.kind,
                ToolAsset.id != asset.id,
            )
            .values(is_latest=False)
        )
        asset.is_latest = True
    elif promote_latest is False:
        asset.is_latest = False
    await db.commit()
    await db.refresh(asset)
    return await _serialize_asset(db, asset)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_asset(
    asset_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
) -> None:
    asset = await db.get(ToolAsset, asset_id)
    if not asset:
        raise NotFound("tool_asset")
    await db.delete(asset)
    await db.commit()


@router.get("/assets/{asset_id}/download")
async def download_asset(
    asset_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
):
    """Stream the binary back to the admin previewing/downloading the file.

    Bumps `download_count` opportunistically — admin downloads count too
    (it's a rough indicator, not billing telemetry). Returns the bytes as
    a binary response with `Content-Disposition: attachment`."""
    from fastapi.responses import Response

    asset = await db.get(ToolAsset, asset_id)
    if not asset:
        raise NotFound("tool_asset")
    f = await db.get(File, asset.file_id)
    if not f:
        raise NotFound("file")
    data = await files_service.read_file_bytes(f)
    asset.download_count = int(asset.download_count or 0) + 1
    await db.commit()
    return Response(
        content=data,
        media_type=f.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{f.file_name}"',
        },
    )
