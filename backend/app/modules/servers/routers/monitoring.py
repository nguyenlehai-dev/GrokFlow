"""Server monitoring endpoints — metrics history, alerts, summary.

Mounted at `/api/admin/servers/...`. Read-only except for `acknowledge`
which lets an admin mark an alert as seen (it stays open until the
monitor itself resolves it via threshold recovery)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select

from app.core.deps import DbSession, SuperAdminUser
from app.core.exceptions import NotFound
from app.models import Server, ServerAlert, ServerMetricHistory


router = APIRouter(prefix="/servers", tags=["servers-monitoring"])


# ─── Schemas ────────────────────────────────────────────────────────────


class MetricPoint(BaseModel):
    sampled_at: datetime
    status: str
    cpu_pct: float | None = None
    ram_used_bytes: int | None = None
    ram_total_bytes: int | None = None
    disk_used_bytes: int | None = None
    disk_total_bytes: int | None = None
    load_avg_1m: float | None = None
    uptime_seconds: int | None = None
    probe_duration_ms: int | None = None
    error_message: str | None = None


class AlertOut(BaseModel):
    id: uuid.UUID
    server_id: uuid.UUID
    server_label: str
    kind: str
    severity: str
    message: str
    trigger_value: str | None
    started_at: datetime
    resolved_at: datetime | None
    acknowledged_at: datetime | None
    is_open: bool

    class Config:
        from_attributes = True


class SeveritySummary(BaseModel):
    """One row in the dashboard's "Problems by severity" table."""
    server_id: uuid.UUID
    server_label: str
    disaster: int
    high: int
    average: int
    warning: int
    information: int


class SummaryOut(BaseModel):
    totals: dict[str, int]
    per_server: list[SeveritySummary]
    generated_at: datetime


# ─── Metrics history ────────────────────────────────────────────────────


@router.get("/{server_id}/metrics-history", response_model=list[MetricPoint])
async def get_metrics_history(
    server_id: uuid.UUID, _: SuperAdminUser, db: DbSession,
    hours: int = Query(default=24, ge=1, le=168,
                       description="How far back to fetch (max 7 days)"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[ServerMetricHistory]:
    """Time-series for the detail page graph. Default last 24h, hard cap
    at 7 days (matches HISTORY_RETENTION_DAYS in the monitor worker)."""
    if not await db.get(Server, server_id):
        raise NotFound("server")
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (await db.execute(
        select(ServerMetricHistory)
        .where(
            ServerMetricHistory.server_id == server_id,
            ServerMetricHistory.sampled_at >= cutoff,
        )
        .order_by(ServerMetricHistory.sampled_at.asc())
        .limit(limit)
    )).scalars().all()
    return list(rows)


# ─── Alerts ─────────────────────────────────────────────────────────────


@router.get("/alerts", response_model=list[AlertOut])
async def list_all_alerts(
    _: SuperAdminUser, db: DbSession,
    status: Literal["open", "resolved", "all"] = Query(default="open"),
    severity: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
) -> list[AlertOut]:
    """Cross-server alert feed. Default returns only currently-open alerts —
    pass `status=all` to see history including resolved rows."""
    stmt = (
        select(ServerAlert, Server.label)
        .join(Server, ServerAlert.server_id == Server.id)
        .order_by(ServerAlert.started_at.desc())
        .limit(limit)
    )
    if status == "open":
        stmt = stmt.where(ServerAlert.resolved_at.is_(None))
    elif status == "resolved":
        stmt = stmt.where(ServerAlert.resolved_at.is_not(None))
    if severity:
        stmt = stmt.where(ServerAlert.severity == severity)

    rows = (await db.execute(stmt)).all()
    out = []
    for alert, label in rows:
        out.append(AlertOut(
            id=alert.id, server_id=alert.server_id, server_label=label,
            kind=alert.kind, severity=alert.severity, message=alert.message,
            trigger_value=alert.trigger_value, started_at=alert.started_at,
            resolved_at=alert.resolved_at,
            acknowledged_at=alert.acknowledged_at,
            is_open=alert.resolved_at is None,
        ))
    return out


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: uuid.UUID, admin: SuperAdminUser, db: DbSession,
) -> AlertOut:
    """Admin says 'I've seen this'. Alert stays open until the monitor
    detects the underlying metric recovered; acknowledgement just hides
    it from the urgent-bell list."""
    alert = await db.get(ServerAlert, alert_id)
    if not alert:
        raise NotFound("alert")
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = admin.id
    await db.commit()
    server = await db.get(Server, alert.server_id)
    return AlertOut(
        id=alert.id, server_id=alert.server_id,
        server_label=server.label if server else "(deleted)",
        kind=alert.kind, severity=alert.severity, message=alert.message,
        trigger_value=alert.trigger_value, started_at=alert.started_at,
        resolved_at=alert.resolved_at,
        acknowledged_at=alert.acknowledged_at,
        is_open=alert.resolved_at is None,
    )


# ─── Dashboard widget ───────────────────────────────────────────────────


@router.get("/alerts-summary", response_model=SummaryOut)
async def alerts_summary(_: SuperAdminUser, db: DbSession) -> SummaryOut:
    """Counts of currently-open alerts by (server, severity), matching the
    "Problems by severity" table in the Zabbix-style dashboard."""
    severities = ("disaster", "high", "average", "warning", "information")

    counts_stmt = (
        select(
            Server.id, Server.label,
            *[
                func.sum(case((ServerAlert.severity == sev, 1), else_=0)).label(sev)
                for sev in severities
            ],
        )
        .join(ServerAlert,
              (ServerAlert.server_id == Server.id)
              & (ServerAlert.resolved_at.is_(None)),
              isouter=True)
        .group_by(Server.id, Server.label)
        .order_by(Server.label)
    )
    rows = (await db.execute(counts_stmt)).all()

    per_server = []
    totals = {s: 0 for s in severities}
    for row in rows:
        server_id, label, dis, hig, avg, war, inf = row
        per_server.append(SeveritySummary(
            server_id=server_id, server_label=label or "(unnamed)",
            disaster=int(dis or 0), high=int(hig or 0),
            average=int(avg or 0), warning=int(war or 0),
            information=int(inf or 0),
        ))
        totals["disaster"] += int(dis or 0)
        totals["high"] += int(hig or 0)
        totals["average"] += int(avg or 0)
        totals["warning"] += int(war or 0)
        totals["information"] += int(inf or 0)

    return SummaryOut(
        totals=totals, per_server=per_server,
        generated_at=datetime.now(timezone.utc),
    )
