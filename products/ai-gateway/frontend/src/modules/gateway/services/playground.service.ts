import axios from "axios";

import { api } from "@/core/api/axios";

import type { ExecuteResp } from "../models/request";

/** Helpers used by the Gateway Playground page.
 *
 *  Two auth paths share these endpoints:
 *   - Admin (super_admin) → goes through the GrokFlow JWT (`api` instance,
 *     same-origin or VITE_API_BASE_URL).
 *   - Per-tenant admin → bearer-only with a `gwk_live_*` key, no JWT. We
 *     can't reuse `api` for that because its interceptor would re-stamp
 *     the JWT Authorization header on top.
 */
function buildHeaders(gatewayKey: string) {
  return {
    Authorization: `Bearer ${gatewayKey}`,
    "Content-Type": "application/json",
  };
}

export const playgroundService = {
  /** Synchronous execute against a function code. */
  execute: (
    functionCode: string,
    payload: Record<string, unknown>,
    opts: { isAdmin: boolean; gatewayKey?: string | null } = { isAdmin: true },
  ) => {
    const path = `/api/v1/gateway/functions/${functionCode}/execute`;
    if (opts.isAdmin) {
      return api.post<ExecuteResp>(path, payload).then((r) => r.data);
    }
    return axios
      .post<ExecuteResp>(path, payload, { headers: buildHeaders(opts.gatewayKey ?? "") })
      .then((r) => r.data);
  },

  /** Asynchronous submit — returns a gw_id immediately. */
  submit: (
    functionCode: string,
    payload: Record<string, unknown>,
    opts: { isAdmin: boolean; gatewayKey?: string | null } = { isAdmin: true },
  ) => {
    const path = `/api/v1/gateway/functions/${functionCode}/submit`;
    if (opts.isAdmin) {
      return api.post<ExecuteResp>(path, payload).then((r) => r.data);
    }
    return axios
      .post<ExecuteResp>(path, payload, { headers: buildHeaders(opts.gatewayKey ?? "") })
      .then((r) => r.data);
  },

  /** Fetch request status by gw_id (admin/JWT or bearer key). */
  status: (
    gwId: string,
    opts: { isAdmin: boolean; gatewayKey?: string | null } = { isAdmin: true },
  ) => {
    const path = `/api/v1/gateway/requests/${gwId}/status`;
    if (opts.isAdmin) {
      return api
        .get<ExecuteResp & { status: string }>(path)
        .then((r) => r.data);
    }
    return axios
      .get<ExecuteResp & { status: string }>(path, {
        headers: { Authorization: `Bearer ${opts.gatewayKey ?? ""}` },
      })
      .then((r) => r.data);
  },

  /** Multipart upload — returns the public URL the gateway will reuse as a
   *  reference media URL. Admin uses `api` (JWT). Non-admin uses raw axios
   *  with the Gateway API Key. */
  uploadMedia: (
    file: File,
    opts: { isAdmin: boolean; gatewayKey?: string | null } = { isAdmin: true },
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    const path = "/api/v1/gateway/uploads";
    if (opts.isAdmin) {
      // No manual Content-Type — axios sets the multipart boundary itself.
      return api.post<{ url: string }>(path, fd).then((r) => r.data);
    }
    return axios
      .post<{ url: string }>(path, fd, {
        headers: {
          Authorization: `Bearer ${opts.gatewayKey ?? ""}`,
          "Content-Type": "multipart/form-data",
        },
      })
      .then((r) => r.data);
  },
};
