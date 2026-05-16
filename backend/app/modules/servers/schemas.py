"""Pydantic schemas for /api/admin/servers/*."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ServerStatus = Literal["active", "stopped", "unknown", "unreachable"]
ServerAction = Literal["start", "reboot", "stop", "shutdown", "reinstall"]


class ServerIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    hostname: str = Field(min_length=1, max_length=255)
    ssh_user: str = Field(min_length=1, max_length=120)
    ssh_password: str | None = Field(default=None, description="Plaintext; encrypted at rest.")
    ssh_key_path: str | None = None
    ssh_port: int = 22
    description: str | None = None
    tags: list[str] | None = None


class ServerUpdate(BaseModel):
    label: str | None = None
    hostname: str | None = None
    ssh_user: str | None = None
    ssh_password: str | None = Field(default=None, description="Set to non-empty to rotate.")
    ssh_key_path: str | None = None
    ssh_port: int | None = None
    description: str | None = None
    tags: list[str] | None = None


class ServerOut(BaseModel):
    id: uuid.UUID
    label: str
    hostname: str
    ssh_user: str
    ssh_port: int
    description: str | None
    status: ServerStatus
    last_seen_at: datetime | None
    tags: list[str] | None
    created_at: datetime

    class Config:
        from_attributes = True


class ServerMetrics(BaseModel):
    """Live snapshot scraped over SSH on each request.

    Fields are optional because parsing might fail partially (e.g. uptime
    works but free returns differently on the target distro) — the UI
    just hides whatever is None.
    """
    os: str | None = None
    kernel: str | None = None
    uptime: str | None = None
    cpu_cores: int | None = None
    cpu_usage_pct: float | None = None
    memory_total_gb: float | None = None
    memory_used_gb: float | None = None
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    boot_order: str | None = None
    network_cap_mbps: int | None = None
    network_in_mbps: float | None = None
    network_out_mbps: float | None = None


class ServerDetailOut(ServerOut):
    """Detail view = ServerOut + live metrics. Returned by GET /servers/{id}."""
    metrics: ServerMetrics | None = None


class ServerActionRequest(BaseModel):
    action: ServerAction


class ServerActionResponse(BaseModel):
    ok: bool
    message: str
    status: ServerStatus


class ServerBackupOut(BaseModel):
    """Restore-point row.

    Backed by a real backup table once that ships; for now the BE returns
    a synthetic fixture so the FE list+restore flow can be exercised
    end-to-end.
    """
    id: str
    server_id: uuid.UUID
    created_at: datetime
    size_gb: float
    status: Literal["complete", "in_progress", "failed"]
