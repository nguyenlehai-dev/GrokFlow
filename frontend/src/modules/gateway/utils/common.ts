import { api } from "@/core/api/axios";

// Use the existing GrokFlow JWT (admin role) — all gateway endpoints sit
// under /api/v1/gateway/* on the same backend, so no separate API client.
export const gwApi = api;

export function extractError(e: any): string {
  const d = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return d.message ?? d.summary ?? JSON.stringify(d);
  return "Lỗi";
}
