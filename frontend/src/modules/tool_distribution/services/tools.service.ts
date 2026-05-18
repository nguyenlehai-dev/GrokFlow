import { api } from "@/core/api/axios";

import type {
  Tool, ToolAsset, ToolCreate, ToolUpdate, ToolAssetUpdate, AssetKind,
} from "../models/tool";

/** Admin Tool Distribution API client.
 *
 *  All requests hit `/api/admin/tools/*` which is super_admin-only on the
 *  backend. The list endpoint returns each tool with its `assets[]`
 *  inlined, so per-route filtering happens client-side (we already have
 *  the data — no extra round trip). */
export const toolsService = {
  list: () => api.get<Tool[]>("/api/admin/tools").then((r) => r.data),

  create: (payload: ToolCreate) =>
    api.post<Tool>("/api/admin/tools", payload).then((r) => r.data),

  update: (id: string, payload: ToolUpdate) =>
    api.patch<Tool>(`/api/admin/tools/${id}`, payload).then((r) => r.data),

  remove: (id: string) => api.delete(`/api/admin/tools/${id}`),

  uploadLogo: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<Tool>(`/api/admin/tools/${id}/logo`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  uploadAsset: (
    toolId: string,
    params: {
      file: File;
      kind: AssetKind;
      label: string;
      version?: string;
      notes?: string;
      is_latest?: boolean;
    },
  ) => {
    const fd = new FormData();
    fd.append("file", params.file);
    fd.append("kind", params.kind);
    fd.append("label", params.label);
    if (params.version) fd.append("version", params.version);
    if (params.notes) fd.append("notes", params.notes);
    fd.append("is_latest", String(params.is_latest ?? true));
    return api.post<ToolAsset>(`/api/admin/tools/${toolId}/assets`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  updateAsset: (assetId: string, payload: ToolAssetUpdate) =>
    api.patch<ToolAsset>(`/api/admin/tools/assets/${assetId}`, payload).then((r) => r.data),

  deleteAsset: (assetId: string) =>
    api.delete(`/api/admin/tools/assets/${assetId}`),
};
