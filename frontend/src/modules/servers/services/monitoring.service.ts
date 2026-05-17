import { api } from "@/core/api/axios";


// ─── Types (mirror backend Pydantic) ───────────────────────────────────


export interface MetricPoint {
  sampled_at: string;
  status: "active" | "unreachable" | "stopped";
  cpu_pct: number | null;
  ram_used_bytes: number | null;
  ram_total_bytes: number | null;
  disk_used_bytes: number | null;
  disk_total_bytes: number | null;
  load_avg_1m: number | null;
  uptime_seconds: number | null;
  probe_duration_ms: number | null;
  error_message: string | null;
}

export type AlertSeverity = "disaster" | "high" | "average" | "warning" | "information";

export interface Alert {
  id: string;
  server_id: string;
  server_label: string;
  kind: string;
  severity: AlertSeverity;
  message: string;
  trigger_value: string | null;
  started_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  is_open: boolean;
}

export interface SeveritySummary {
  server_id: string;
  server_label: string;
  disaster: number;
  high: number;
  average: number;
  warning: number;
  information: number;
}

export interface SummaryResponse {
  totals: Record<AlertSeverity, number>;
  per_server: SeveritySummary[];
  generated_at: string;
}


// ─── Reboot ────────────────────────────────────────────────────────────


export interface RebootSchedule {
  server_id: string;
  cron: string | null;
  min_uptime_hours: number;
  next_run_at: string | null;
  last_reboot_at: string | null;
  last_reboot_trigger: string | null;
  last_reboot_status: string | null;
}

export interface RebootHistoryRow {
  id: string;
  server_id: string;
  server_label: string;
  trigger: "scheduled" | "manual";
  triggered_by: string | null;
  status: "queued" | "running" | "success" | "failed";
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}


// ─── Backup ────────────────────────────────────────────────────────────


export interface BackupConfig {
  server_id: string;
  cron: string | null;
  target_path: string;
  paths: string[];
  db_name: string | null;
  retain_days: number;
  next_run_at: string | null;
  last_backup_at: string | null;
  last_backup_status: string | null;
  last_backup_path: string | null;
  last_backup_size_bytes: number | null;
}

export interface BackupHistoryRow {
  id: string;
  server_id: string;
  server_label: string;
  trigger: "scheduled" | "manual";
  triggered_by: string | null;
  status: "queued" | "running" | "success" | "failed";
  output_path: string | null;
  size_bytes: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}


// ─── Service ───────────────────────────────────────────────────────────


export const monitoringService = {
  metricsHistory: (serverId: string, hours = 24) =>
    api.get<MetricPoint[]>(`/api/admin/servers/${serverId}/metrics-history`, {
      params: { hours },
    }).then((r) => r.data),

  listAlerts: (params?: { status?: "open" | "resolved" | "all"; severity?: AlertSeverity }) =>
    api.get<Alert[]>("/api/admin/servers/alerts", { params }).then((r) => r.data),

  acknowledgeAlert: (alertId: string) =>
    api.post<Alert>(`/api/admin/servers/alerts/${alertId}/acknowledge`).then((r) => r.data),

  alertsSummary: () =>
    api.get<SummaryResponse>("/api/admin/servers/alerts-summary").then((r) => r.data),

  // Reboot
  getRebootSchedule: (serverId: string) =>
    api.get<RebootSchedule>(`/api/admin/servers/${serverId}/reboot-schedule`).then((r) => r.data),
  setRebootSchedule: (serverId: string, payload: { cron: string | null; min_uptime_hours: number }) =>
    api.put<RebootSchedule>(`/api/admin/servers/${serverId}/reboot-schedule`, payload).then((r) => r.data),
  rebootHistory: (serverId?: string) =>
    api.get<RebootHistoryRow[]>("/api/admin/servers/reboot-history", {
      params: serverId ? { server_id: serverId } : undefined,
    }).then((r) => r.data),

  // Backup
  getBackupConfig: (serverId: string) =>
    api.get<BackupConfig>(`/api/admin/servers/${serverId}/backup-config`).then((r) => r.data),
  setBackupConfig: (serverId: string, payload: {
    cron: string | null;
    target_path: string;
    paths: string[];
    db_name: string | null;
    retain_days: number;
  }) =>
    api.put<BackupConfig>(`/api/admin/servers/${serverId}/backup-config`, payload).then((r) => r.data),
  backupNow: (serverId: string) =>
    api.post<BackupHistoryRow>(`/api/admin/servers/${serverId}/backup-now`).then((r) => r.data),
  backupHistory: (serverId?: string) =>
    api.get<BackupHistoryRow[]>("/api/admin/servers/backup-history", {
      params: serverId ? { server_id: serverId } : undefined,
    }).then((r) => r.data),
};
