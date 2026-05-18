import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity, AlertTriangle, RotateCcw, Database, FileText, BarChart3,
  CheckCircle2, XCircle, Loader2, Calendar,
} from "lucide-react";

import { monitoringService } from "../services/monitoring.service";
import type {
  MetricPoint, Alert, RebootHistoryRow, BackupHistoryRow, AlertSeverity,
} from "../services/monitoring.service";


/** Tabbed monitoring panel for the server detail page.
 *
 *  Replaces the old TODO Graphs/Logs/Reinstall tiles + the synthetic
 *  BackupHistoryCard. Three tabs:
 *    • Metrics    — sparkline of cpu/ram/disk last 24h
 *    • Alerts     — open + recently-resolved alerts (this server)
 *    • History    — interleaved reboot + backup events */
export function ServerMonitoringPanel({ serverId }: { serverId: string }) {
  const [tab, setTab] = useState<"metrics" | "alerts" | "history">("metrics");

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-slate-100 bg-slate-50/40">
        <TabBtn active={tab === "metrics"} onClick={() => setTab("metrics")} icon={BarChart3}>
          Metrics (24h)
        </TabBtn>
        <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")} icon={AlertTriangle}>
          Alerts
        </TabBtn>
        <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={FileText}>
          History
        </TabBtn>
      </div>
      <div className="p-4">
        {tab === "metrics" && <MetricsTab serverId={serverId} />}
        {tab === "alerts" && <AlertsTab serverId={serverId} />}
        {tab === "history" && <HistoryTab serverId={serverId} />}
      </div>
    </div>
  );
}


function TabBtn({
  active, onClick, icon: Icon, children,
}: { active: boolean; onClick: () => void; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
        active
          ? "text-blue-600 border-b-2 border-blue-500 bg-white"
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}


// ─── Metrics tab ───────────────────────────────────────────────────────


function MetricsTab({ serverId }: { serverId: string }) {
  const { data: points = [], isLoading } = useQuery({
    queryKey: ["admin-server-metrics-history", serverId],
    queryFn: () => monitoringService.metricsHistory(serverId, 24),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center text-slate-400">
        <Loader2 className="inline animate-spin mr-1.5" size={14} /> Đang tải metrics…
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        Chưa có dữ liệu. Worker monitor sẽ probe mỗi 60s — quay lại sau ~1 phút.
      </div>
    );
  }

  const last = points[points.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="CPU" value={last.cpu_pct != null ? `${last.cpu_pct.toFixed(1)}%` : "—"}
          tone={cpuTone(last.cpu_pct)}
        />
        <Stat
          label="RAM" value={ramText(last)}
          tone={ramTone(last)}
        />
        <Stat
          label="Disk" value={diskText(last)}
          tone={diskTone(last)}
        />
      </div>

      <div className="space-y-1">
        <Sparkline points={points} accessor={(p) => p.cpu_pct ?? 0} label="CPU %" color="#06b6d4" />
        <Sparkline points={points} accessor={(p) => p.ram_used_bytes != null && p.ram_total_bytes ? (p.ram_used_bytes / p.ram_total_bytes) * 100 : 0} label="RAM %" color="#8b5cf6" />
        <Sparkline points={points} accessor={(p) => p.disk_used_bytes != null && p.disk_total_bytes ? (p.disk_used_bytes / p.disk_total_bytes) * 100 : 0} label="Disk %" color="#f59e0b" />
        <Sparkline points={points} accessor={(p) => p.probe_duration_ms ?? 0} label="Probe latency (ms)" color="#10b981" max={5000} />
      </div>

      <div className="text-[11px] text-slate-400 text-center">
        {points.length} samples · từ {new Date(points[0].sampled_at).toLocaleString()} đến {new Date(last.sampled_at).toLocaleString()}
      </div>
    </div>
  );
}


function cpuTone(v: number | null): "ok" | "warn" | "bad" {
  if (v == null) return "ok";
  if (v >= 85) return "bad";
  if (v >= 70) return "warn";
  return "ok";
}
function ramText(p: MetricPoint): string {
  if (!p.ram_used_bytes || !p.ram_total_bytes) return "—";
  return `${(p.ram_used_bytes / 1024 ** 3).toFixed(1)} / ${(p.ram_total_bytes / 1024 ** 3).toFixed(1)} GB`;
}
function ramTone(p: MetricPoint): "ok" | "warn" | "bad" {
  if (!p.ram_used_bytes || !p.ram_total_bytes) return "ok";
  const pct = (p.ram_used_bytes / p.ram_total_bytes) * 100;
  return pct >= 90 ? "bad" : pct >= 75 ? "warn" : "ok";
}
function diskText(p: MetricPoint): string {
  if (!p.disk_used_bytes || !p.disk_total_bytes) return "—";
  return `${(p.disk_used_bytes / 1024 ** 3).toFixed(0)} / ${(p.disk_total_bytes / 1024 ** 3).toFixed(0)} GB`;
}
function diskTone(p: MetricPoint): "ok" | "warn" | "bad" {
  if (!p.disk_used_bytes || !p.disk_total_bytes) return "ok";
  const pct = (p.disk_used_bytes / p.disk_total_bytes) * 100;
  return pct >= 85 ? "bad" : pct >= 70 ? "warn" : "ok";
}


function Stat({
  label, value, tone,
}: { label: string; value: string; tone: "ok" | "warn" | "bad" }) {
  const cls =
    tone === "bad" ? "bg-rose-50 text-rose-700 ring-rose-200"
    : tone === "warn" ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <div className={`rounded-lg ring-1 px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-mono font-bold text-base">{value}</div>
    </div>
  );
}


/** Tiny SVG sparkline — no external chart lib. Renders the value
 *  series scaled into a fixed-height rect, with an inline area fill. */
function Sparkline({
  points, accessor, label, color, max,
}: {
  points: MetricPoint[];
  accessor: (p: MetricPoint) => number;
  label: string;
  color: string;
  max?: number;
}) {
  if (points.length < 2) return null;
  const W = 600;
  const H = 36;
  const vals = points.map(accessor);
  const top = max ?? Math.max(...vals, 1);
  const path = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - (v / top) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const last = vals[vals.length - 1];

  return (
    <div className="flex items-center gap-3">
      <div className="text-[10px] text-slate-500 w-28 shrink-0">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1 h-9" preserveAspectRatio="none">
        <path d={area} fill={color} fillOpacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
      <div className="text-[10px] font-mono text-slate-500 w-12 text-right">
        {last.toFixed(0)}
      </div>
    </div>
  );
}


// ─── Alerts tab ────────────────────────────────────────────────────────


function AlertsTab({ serverId }: { serverId: string }) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["admin-server-alerts-detail", serverId],
    queryFn: () => monitoringService.listAlerts({ status: "all" }),
    refetchInterval: 30_000,
    select: (rows) => rows.filter((r) => r.server_id === serverId),
  });

  if (isLoading) return <Spinner />;
  if (alerts.length === 0) {
    return (
      <div className="py-8 text-center text-emerald-500 text-sm flex flex-col items-center gap-1.5">
        <CheckCircle2 size={22} /> Server đang hoạt động bình thường — chưa có alert.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </ul>
  );
}


const SEV_COLOR: Record<AlertSeverity, string> = {
  disaster:    "border-rose-300 bg-rose-50/40 text-rose-800",
  high:        "border-orange-300 bg-orange-50/40 text-orange-800",
  average:     "border-amber-300 bg-amber-50/40 text-amber-800",
  warning:     "border-cyan-300 bg-cyan-50/40 text-cyan-800",
  information: "border-sky-300 bg-sky-50/40 text-sky-800",
};


function AlertRow({ alert }: { alert: Alert }) {
  return (
    <li className={`rounded-lg border-l-4 p-2.5 text-sm ${SEV_COLOR[alert.severity]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{alert.kind}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold opacity-70">{alert.severity}</span>
          {alert.is_open ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">OPEN</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">resolved</span>
          )}
        </div>
      </div>
      <div className="text-xs mt-1 opacity-80">{alert.message}</div>
      <div className="text-[10px] opacity-60 mt-1">
        Bắt đầu {new Date(alert.started_at).toLocaleString()}
        {alert.resolved_at && <> · resolved {new Date(alert.resolved_at).toLocaleString()}</>}
        {alert.trigger_value && <> · value={alert.trigger_value}</>}
      </div>
    </li>
  );
}


// ─── History tab ───────────────────────────────────────────────────────


function HistoryTab({ serverId }: { serverId: string }) {
  const reboots = useQuery({
    queryKey: ["admin-server-reboot-history", serverId],
    queryFn: () => monitoringService.rebootHistory(serverId),
    refetchInterval: 60_000,
  });
  const backups = useQuery({
    queryKey: ["admin-server-backup-history", serverId],
    queryFn: () => monitoringService.backupHistory(serverId),
    refetchInterval: 60_000,
  });

  if (reboots.isLoading || backups.isLoading) return <Spinner />;

  const events = [
    ...(reboots.data ?? []).map((r) => ({ kind: "reboot" as const, ts: r.started_at, row: r })),
    ...(backups.data ?? []).map((b) => ({ kind: "backup" as const, ts: b.started_at, row: b })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        Chưa có sự kiện reboot hay backup nào. Vào "Lịch reboot" / "Backup config" để setup.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {events.slice(0, 50).map((e, i) => (
        <li key={`${e.kind}-${i}`} className="border border-slate-200 rounded p-2 text-xs flex items-start gap-2">
          {e.kind === "reboot" ? (
            <RotateCcw size={14} className="text-blue-500 mt-0.5 shrink-0" />
          ) : (
            <Database size={14} className="text-emerald-500 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">
                {e.kind === "reboot" ? "Reboot" : "Backup"}
              </span>
              <span className="text-[10px] text-slate-500">
                {(e.row as RebootHistoryRow | BackupHistoryRow).trigger}
              </span>
              <StatusPill status={(e.row as RebootHistoryRow | BackupHistoryRow).status} />
              <span className="flex-1" />
              <span className="text-[10px] text-slate-400">
                {new Date(e.ts).toLocaleString()}
              </span>
            </div>
            {e.kind === "backup" && (e.row as BackupHistoryRow).output_path && (
              <div className="text-[10px] text-slate-500 mt-0.5 truncate font-mono">
                → {(e.row as BackupHistoryRow).output_path}
                {(e.row as BackupHistoryRow).size_bytes && (
                  <> ({formatBytes((e.row as BackupHistoryRow).size_bytes!)})</>
                )}
              </div>
            )}
            {(e.row as RebootHistoryRow | BackupHistoryRow).error_message && (
              <div className="text-[10px] text-rose-600 mt-0.5 italic">
                {(e.row as RebootHistoryRow | BackupHistoryRow).error_message}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}


function StatusPill({ status }: { status: string }) {
  const cls =
    status === "success" ? "bg-emerald-100 text-emerald-700"
    : status === "failed" ? "bg-rose-100 text-rose-700"
    : status === "running" ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";
  return (
    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}


function Spinner() {
  return (
    <div className="py-6 text-center text-slate-400">
      <Loader2 className="inline animate-spin" size={14} />
    </div>
  );
}


function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
