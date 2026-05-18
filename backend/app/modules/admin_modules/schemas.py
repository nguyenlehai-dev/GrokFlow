"""Pydantic schemas for the module marketplace API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ModuleMenu(BaseModel):
    label: str
    icon: str = "Box"
    order: int = 999
    group: str | None = None


class ModuleFrontendSpec(BaseModel):
    dockerfile: str = "frontend/Dockerfile"
    port: int = 80
    build_args: dict[str, str] = Field(default_factory=dict)


class ModuleBackendSpec(BaseModel):
    dockerfile: str = "backend/Dockerfile"
    port: int = 8000
    health_path: str = "/health"
    startup_command: str | None = None


class ModuleDatabaseSpec(BaseModel):
    schema_name: str = Field(alias="schema")
    read_core_tables: list[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class ModulePermissions(BaseModel):
    scopes: list[str] = Field(default_factory=list)


class ModuleResources(BaseModel):
    memory: str = "512m"
    cpus: float = 0.5


class ModuleManifestSchema(BaseModel):
    """Mirrors the JSON schema member modules must follow."""

    name: str = Field(pattern=r"^[a-z][a-z0-9_]{2,30}$")
    version: str
    author: str | None = None
    description: str | None = None

    menu: ModuleMenu
    frontend: ModuleFrontendSpec = Field(default_factory=ModuleFrontendSpec)
    backend: ModuleBackendSpec = Field(default_factory=ModuleBackendSpec)
    database: ModuleDatabaseSpec | None = None
    permissions: ModulePermissions = Field(default_factory=ModulePermissions)
    resources: ModuleResources = Field(default_factory=ModuleResources)


# ─── Request / Response models ────────────────────────────────────────


class ModuleInstallRequest(BaseModel):
    git_url: str
    git_ref: str = "main"
    github_pat: str | None = None


class ModuleOut(BaseModel):
    id: UUID
    slug: str
    version: str
    git_url: str
    git_ref: str
    manifest: dict[str, Any]
    status: str
    last_error: str | None
    fe_container_id: str | None
    be_container_id: str | None
    db_schema: str
    installed_at: datetime
    installed_by: UUID | None

    class Config:
        from_attributes = True
