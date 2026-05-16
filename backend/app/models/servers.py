"""Server-management models — managed VPS hosts.

A Server row is a remote machine the platform can SSH into to start /
stop / reboot / read metrics. Credentials are encrypted at rest using
the app's `ENCRYPTION_KEY` (same Fernet box that protects browser
profile cookies).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ._base import Base, JSONType, TimestampMixin, UUIDType, _uuid


class Server(Base, TimestampMixin):
    """A managed remote host (VPS, bare-metal, etc).

    The backend opens an SSH session per request — there is no
    long-lived connection. Cheap because paramiko's overhead is in
    handshake, not in the call itself, and admin pages aren't hot.
    """
    __tablename__ = "servers"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    # Display name shown in the UI (e.g. "vps-primary").
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    # Hostname or IP the SSH client connects to. NOT a public domain in most
    # deployments — usually a LAN IP or Tailscale name.
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    ssh_user: Mapped[str] = mapped_column(String(120), nullable=False)
    # Fernet-encrypted SSH password. Empty when key-based auth is used
    # (key path stored in `ssh_key_path`).
    ssh_password_encrypted: Mapped[str | None] = mapped_column(Text)
    # Path on the BE container to an SSH private key. NULL = password auth.
    ssh_key_path: Mapped[str | None] = mapped_column(String(500))
    ssh_port: Mapped[int] = mapped_column(Integer, nullable=False, default=22, server_default="22")
    # Free-text notes for the admin UI.
    description: Mapped[str | None] = mapped_column(Text)
    # Cached state — refreshed each time the detail page is opened or
    # every 30s via a future health-check worker.
    #   active   — last SSH connect OK
    #   stopped  — last SSH connect timed out / refused
    #   unknown  — never probed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown", server_default="unknown")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # JSON list of free-form labels (e.g. ["prod", "primary"]).
    tags: Mapped[list | None] = mapped_column(JSONType)
