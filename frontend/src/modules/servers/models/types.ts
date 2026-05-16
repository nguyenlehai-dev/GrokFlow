export type ServerStatus = "active" | "stopped" | "suspended" | "error";

export interface ServerSummary {
  id: string;
  hostname: string;
  ip: string;
  status: ServerStatus;
  os: string;
  cpu_cores: number;
  cpu_usage_pct: number;
  memory_total_gb: number;
  memory_used_gb: number;
  network_in_mbps: number;
  network_out_mbps: number;
  network_cap_mbps: number;
  boot_order: string;
  tags?: string[];
}

export interface ServerBackup {
  id: string;
  server_id: string;
  /** ISO timestamp. */
  created_at: string;
  size_gb: number;
  status: "complete" | "in_progress" | "failed";
}

export type ServerAction =
  | "start"
  | "reboot"
  | "stop"
  | "shutdown"
  | "reinstall";

export interface ServerActionResult {
  ok: boolean;
  message?: string;
}
