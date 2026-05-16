import { api } from "@/core/api/axios";

import type {
  ServerAction,
  ServerActionResult,
  ServerBackup,
  ServerStatus,
  ServerSummary,
} from "../models/types";

/* ---------- BE shapes (mirror backend/app/modules/servers/schemas.py) ---------- */

interface BeServerOut {
  id: string;
  label: string;
  hostname: string;
  ssh_user: string;
  ssh_port: number;
  description: string | null;
  status: "active" | "stopped" | "unknown" | "unreachable";
  last_seen_at: string | null;
  tags: string[] | null;
  created_at: string;
}

interface BeServerMetrics {
  os: string | null;
  kernel: string | null;
  uptime: string | null;
  cpu_cores: number | null;
  cpu_usage_pct: number | null;
  memory_total_gb: number | null;
  memory_used_gb: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  boot_order: string | null;
  network_cap_mbps: number | null;
  network_in_mbps: number | null;
  network_out_mbps: number | null;
}

interface BeServerDetailOut extends BeServerOut {
  metrics: BeServerMetrics | null;
}

interface BeServerActionResponse {
  ok: boolean;
  message: string;
  status: BeServerOut["status"];
}

interface BeServerBackup {
  id: string;
  server_id: string;
  created_at: string;
  size_gb: number;
  status: "complete" | "in_progress" | "failed";
}

/* ---------- mapping helpers ---------- */

// FE type uses "active | stopped | suspended | error". BE returns
// "active | stopped | unknown | unreachable". Map unreachable→error,
// unknown→suspended so the existing UI styling keeps working without a
// schema bump.
function mapStatus(s: BeServerOut["status"]): ServerStatus {
  if (s === "active") return "active";
  if (s === "stopped") return "stopped";
  if (s === "unreachable") return "error";
  return "suspended";
}

function mapList(row: BeServerOut): ServerSummary {
  return {
    id: row.id,
    hostname: row.label || row.hostname,
    ip: row.hostname,
    status: mapStatus(row.status),
    os: row.description ?? "—",
    cpu_cores: 0,
    cpu_usage_pct: 0,
    memory_total_gb: 0,
    memory_used_gb: 0,
    network_in_mbps: 0,
    network_out_mbps: 0,
    network_cap_mbps: 0,
    boot_order: "—",
    tags: row.tags ?? undefined,
  };
}

function mapDetail(row: BeServerDetailOut): ServerSummary {
  const m = row.metrics ?? null;
  return {
    id: row.id,
    hostname: row.label || row.hostname,
    ip: row.hostname,
    status: mapStatus(row.status),
    os: m?.os ?? row.description ?? "—",
    cpu_cores: m?.cpu_cores ?? 0,
    cpu_usage_pct: m?.cpu_usage_pct ?? 0,
    memory_total_gb: m?.memory_total_gb ?? 0,
    memory_used_gb: m?.memory_used_gb ?? 0,
    network_in_mbps: m?.network_in_mbps ?? 0,
    network_out_mbps: m?.network_out_mbps ?? 0,
    network_cap_mbps: m?.network_cap_mbps ?? 0,
    boot_order: m?.boot_order ?? "—",
    tags: row.tags ?? undefined,
  };
}

function mapBackup(row: BeServerBackup): ServerBackup {
  return {
    id: row.id,
    server_id: row.server_id,
    created_at: row.created_at,
    size_gb: row.size_gb,
    status: row.status,
  };
}

/* ---------- public API ---------- */

export const serversService = {
  async list(): Promise<ServerSummary[]> {
    const r = await api.get<BeServerOut[]>("/api/admin/servers");
    return r.data.map(mapList);
  },

  async get(id: string): Promise<ServerSummary | undefined> {
    try {
      const r = await api.get<BeServerDetailOut>(`/api/admin/servers/${id}`);
      return mapDetail(r.data);
    } catch (e: any) {
      if (e?.response?.status === 404) return undefined;
      throw e;
    }
  },

  async listBackups(serverId: string): Promise<ServerBackup[]> {
    const r = await api.get<BeServerBackup[]>(`/api/admin/servers/${serverId}/backups`);
    return r.data.map(mapBackup);
  },

  async runAction(id: string, action: ServerAction): Promise<ServerActionResult> {
    try {
      const r = await api.post<BeServerActionResponse>(`/api/admin/servers/${id}/actions/${action}`);
      return { ok: r.data.ok, message: r.data.message };
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? e?.message ?? String(e);
      return { ok: false, message: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
  },

  async restoreBackup(serverId: string, backupId: string): Promise<ServerActionResult> {
    try {
      const r = await api.post<BeServerActionResponse>(
        `/api/admin/servers/${serverId}/backups/${backupId}/restore`,
      );
      return { ok: r.data.ok, message: r.data.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.detail ?? e?.message ?? "Lỗi" };
    }
  },

  async deleteBackup(serverId: string, backupId: string): Promise<ServerActionResult> {
    try {
      const r = await api.delete<BeServerActionResponse>(
        `/api/admin/servers/${serverId}/backups/${backupId}`,
      );
      return { ok: r.data.ok, message: r.data.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.detail ?? e?.message ?? "Lỗi" };
    }
  },
};
