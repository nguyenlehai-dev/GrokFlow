"""Server-management models — managed VPS hosts.

A Server row is a remote machine the platform can SSH into to start /
stop / reboot / read metrics. Credentials are encrypted at rest using
the app's `ENCRYPTION_KEY` (same Fernet box that protects browser
profile cookies).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
    func,
)
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
    # When false, the background monitor skips this server. Use during a
    # planned maintenance window so admin doesn't get pinged by alerts
    # while a box is intentionally down.
    monitor_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true",
    )


class ServerMetricHistory(Base):
    """One row per (server, sample) — populated by the background monitor.

    Rows are append-only. The monitor's housekeeping pass prunes anything
    older than ~7 days so the table stays bounded (typical write rate:
    1 row / 60 s / server). For longer history we'd add a rollup table."""
    __tablename__ = "server_metrics_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    server_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False,
    )
    sampled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # active | unreachable | stopped — same enum as Server.status.
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    cpu_pct: Mapped[float | None] = mapped_column(Float)
    ram_used_bytes: Mapped[int | None] = mapped_column(BigInteger)
    ram_total_bytes: Mapped[int | None] = mapped_column(BigInteger)
    disk_used_bytes: Mapped[int | None] = mapped_column(BigInteger)
    disk_total_bytes: Mapped[int | None] = mapped_column(BigInteger)
    load_avg_1m: Mapped[float | None] = mapped_column(Float)
    uptime_seconds: Mapped[int | None] = mapped_column(BigInteger)
    probe_duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)


class ServerAlert(Base):
    """Problem records the dashboard widget counts by severity.

    Lifecycle:
      • Created when monitor detects a threshold breach (open alert).
      • `acknowledged_at` set when an admin clicks "Ack" — alert stays
        listed but no longer pings new notifications.
      • `resolved_at` set when the same monitor pass detects recovery.

    Severity levels mirror Zabbix:
      disaster — total outage
      high     — critical metric (RAM > 95, disk > 95)
      average  — warning above threshold (RAM > 90, disk > 85, load high)
      warning  — degradation noticed (probe slow, status flapping)
      information — info-only (planned maintenance starting, ...)"""
    __tablename__ = "server_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=_uuid)
    server_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_value: Mapped[str | None] = mapped_column(String(50))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"),
    )
