/** Flow module HTTP client.
 *
 *  Same-origin under /api/flow/* — the GrokFlow backend reverse-proxies into
 *  flow-api with the shared X-API-Key, so the browser never sees the
 *  upstream key.
 *
 *  Override base URL with VITE_MODULE_FLOW_API to point at a separately
 *  hosted Flow service (e.g. when the proxy moves out of this monolith).
 */
import { createHttp } from "@/core/api/factory";
import { moduleManifest } from ".";

export const flowApi = createHttp(moduleManifest.apiBaseUrl);

export type FlowJobStatus =
  | "uploading"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface FlowJob {
  id: string;
  operation: string;
  status: FlowJobStatus;
  progress: number;
  output_url: string | null;
  output_filename: string | null;
  error_message: string | null;
  file_size: number | null;
  duration: number | null;
  created_at: string;
  completed_at: string | null;
  params: Record<string, unknown> | null;
  input_files: { filename: string; object_key: string }[] | null;
}

export interface UploadResponse {
  job_id: string;
  input_files: { filename: string; object_key: string }[];
  backend: "local" | "r2";
}

export async function uploadInputs(
  toolName: string,
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("tool_name", toolName);
  for (const f of files) fd.append("files", f, f.name);
  const r = await flowApi.post<UploadResponse>("/api/flow/upload", fd, {
    onUploadProgress: (e) => {
      if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return r.data;
}

export async function runTool(
  tool: string,
  jobId: string,
  params: Record<string, string | number | boolean | undefined | null>,
): Promise<FlowJob> {
  const fd = new FormData();
  fd.append("job_id", jobId);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    fd.append(k, String(v));
  }
  const r = await flowApi.post<FlowJob>(`/api/flow/run/${tool}`, fd);
  return r.data;
}

export async function getJob(jobId: string): Promise<FlowJob> {
  const r = await flowApi.get<FlowJob>(`/api/flow/jobs/${jobId}`);
  return r.data;
}

export async function retryJob(jobId: string): Promise<FlowJob> {
  const r = await flowApi.post<FlowJob>(`/api/flow/jobs/${jobId}/retry`);
  return r.data;
}

export async function getHealth(): Promise<{ status: string; storage_backend?: string }> {
  const r = await flowApi.get("/api/flow/health");
  return r.data;
}
