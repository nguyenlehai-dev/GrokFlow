// Real-data hooks shared by every Create Video Pro panel.
//
// Goal: each panel reads + writes to `/api/jobs` directly so the data
// you see on screen is the same data that actually went through the
// Grok worker. No more hardcoded SAMPLE arrays.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/axios";
import type { RowStatus } from "./shared";

// Job shape mirrors backend `JobOut`.
export interface JobRow {
  id: string;
  provider: string;
  job_type: string;
  prompt: string;
  status: string;
  profile_id: string | null;
  result_url: string | null;
  error_message: string | null;
  retry_count: number;
  max_retry: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Map backend status → small enum panels render. */
export function mapStatus(s: string): RowStatus {
  if (s === "success") return "success";
  if (s === "failed" || s === "cancelled") return "failed";
  if (["queued", "running", "processing_provider", "retrying"].includes(s)) return "running";
  return "pending";
}

export function isTerminal(s: string): boolean {
  return s === "success" || s === "failed" || s === "cancelled";
}

interface UseGrokJobsOptions {
  jobType: "video" | "image";
  limit?: number;
}

/** Job submit payload — mirrors backend JobCreate. Critical: top-level
 *  fields (input_image_file_id, size, style, n, seed, model) must NOT be
 *  nested inside `options` or the worker silently drops them. Verified
 *  via OpenAPI schema audit. */
export interface JobSubmitPayload {
  prompt: string;
  input_image_file_id?: string;
  size?: string;
  style?: string;
  n?: number;
  seed?: number;
  model?: string;
  profile_id?: string;
  project_id?: string;
  options?: Record<string, unknown>;
}

// ─── Domain quota ──────────────────────────────────────────────────────────
//
// Daily counter the backend enforces in POST /api/jobs. Tool polls every
// 30s so the topbar pill and the panel pre-flight check stay reasonably
// fresh — and refetches on focus so coming back from another window
// shows current usage immediately.

export interface DomainQuota {
  unlimited: boolean;
  period_date: string;
  period_start: string;
  period_end: string;
  used: number;
  /** null when unlimited */
  limit: number | null;
  /** null when unlimited */
  remaining: number | null;
  /** "tool_install" when this machine has its own quota override,
   *  "domain" when inheriting the tenant cap, "none" if neither is set. */
  scope: "tool_install" | "domain" | "none";
}

export function useDomainQuota() {
  return useQuery({
    queryKey: ["domain-quota"],
    queryFn: () => api.get<DomainQuota>("/api/domain/quota").then((r) => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** Pre-flight check before kicking off a batch.
 *
 *  Fetches the freshest quota snapshot (bypassing the 30s cache), then:
 *    • returns the queue untouched if domain is unlimited or has enough headroom
 *    • truncates the queue to `remaining` (with a confirm prompt) when partial
 *    • returns null when quota is fully exhausted (caller should abort)
 *
 *  Always surfaces a toast so the user knows what happened. Use from each
 *  panel's `startBatch()` BEFORE calling `batch.run()`.
 */
export async function checkQuotaBeforeBatch<T>(
  queue: T[],
  toastFn: (msg: string, level?: "info" | "success" | "error") => void,
): Promise<T[] | null> {
  if (queue.length === 0) return queue;
  let snap: DomainQuota;
  try {
    snap = (await api.get<DomainQuota>("/api/domain/quota")).data;
  } catch {
    // Can't reach the quota endpoint — fail open so a quota-API outage
    // doesn't block job submission. Backend will still 429 individually
    // if quota actually is exhausted; this avoids false negatives.
    return queue;
  }
  if (snap.unlimited) return queue;
  const remaining = snap.remaining ?? 0;
  if (remaining >= queue.length) return queue;
  if (remaining === 0) {
    const resetTime = new Date(snap.period_end).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit",
    });
    toastFn(
      `Hết quota hôm nay (${snap.used}/${snap.limit}). Reset lúc ${resetTime}.`,
      "error",
    );
    return null;
  }
  const ok = window.confirm(
    `Bạn còn ${remaining} slot hôm nay, nhưng batch của bạn ${queue.length} job. `
    + `Chỉ chạy ${remaining} job đầu (cắt phần dư), OK?`,
  );
  if (!ok) return null;
  toastFn(`Cắt batch xuống ${remaining} job để vừa quota còn lại.`, "info");
  return queue.slice(0, remaining);
}

/** Master hook for video / image panels. */
export function useGrokJobs({ jobType, limit = 50 }: UseGrokJobsOptions) {
  const qc = useQueryClient();
  const queryKey = ["cvp-jobs", jobType, limit];

  const jobsQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.get<JobRow[]>("/api/jobs", {
        params: { provider: "grok", job_type: jobType, limit },
      }).then((r) => r.data),
    refetchInterval: (q: any) => {
      const data = q.state?.data as JobRow[] | undefined;
      const hasActive = (data ?? []).some((j) => !isTerminal(j.status));
      return hasActive ? 5_000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const submit = useMutation({
    mutationFn: (payload: JobSubmitPayload) =>
      api.post<JobRow>("/api/jobs", {
        provider: "grok",
        job_type: jobType,
        prompt: payload.prompt,
        // Top-level per JobCreate schema. Putting these in `options`
        // makes the backend silently ignore them.
        input_image_file_id: payload.input_image_file_id,
        size: payload.size,
        style: payload.style,
        model: payload.model,
        n: payload.n ?? 1,
        seed: payload.seed,
        profile_id: payload.profile_id,
        project_id: payload.project_id,
        options: payload.options,
      }).then((r) => r.data),
    onSuccess: (job) => {
      qc.setQueryData<JobRow[]>(queryKey, (prev) => [job, ...(prev ?? [])]);
      // Each successful submit burned 1 quota slot — refresh the pill so
      // the user sees "127/500 → 128/500" immediately instead of waiting
      // for the 30s poll.
      qc.invalidateQueries({ queryKey: ["domain-quota"] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post<JobRow>(`/api/jobs/${id}/retry`).then((r) => r.data),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/jobs/${id}`),
    onSuccess: (_data, id) => {
      qc.setQueryData<JobRow[]>(queryKey, (prev) => (prev ?? []).filter((j) => j.id !== id));
    },
  });

  return {
    jobs: jobsQuery.data ?? [],
    isLoading: jobsQuery.isLoading,
    refetch: jobsQuery.refetch,
    invalidate,
    submit,
    cancel,
    retry,
    remove,
    submitting: submit.isPending,
  };
}

/** Upload helper — backend returns { file_id, file_name, mime_type, file_size }. */
export function useUploadInput() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<{
        file_id: string;
        file_name: string;
        mime_type: string;
        file_size: number;
      }>("/api/jobs/upload-input", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return r.data;
    },
  });
}

/** Fetch an authed file URL → blob → object URL so it renders via
 *  `<img src>` / `<video src>` without leaking the JWT.
 *
 *  Why this is needed: `/api/files/{id}/download` requires `Authorization:
 *  Bearer <jwt>` (verified: 403 without, 200 with). Plain `<img src>`
 *  bypasses our axios interceptor → 403. Using a blob URL fixes this
 *  without changing the backend or putting tokens in query strings. */
export function useAuthedMediaUrl(url: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const r = await api.get(url, { responseType: "blob" });
        if (cancelled) return;
        createdUrl = URL.createObjectURL(r.data);
        setBlobUrl(createdUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return blobUrl;
}

// ─── Shared batch loop ─────────────────────────────────────────────────────
//
// Every "batch-style" panel (Text→Video, Image→Video, Sync, Direct Image)
// shares the same submit cadence: chunk → submit-parallel → countdown-pause
// → next chunk. Extracted so each panel doesn't reimplement the loop.

export interface BatchWaitState {
  currentBatch: number;
  totalBatches: number;
  secondsLeft: number;
}

export interface UseBatchSubmitReturn<TItem> {
  waitState: BatchWaitState | null;
  running: boolean;
  run: (params: {
    items: TItem[];
    batchEnabled: boolean;
    batchSize: number;
    delaySec: number;
    submit: (item: TItem) => Promise<unknown>;
    onItemSuccess?: (item: TItem) => void;
    onItemError?: (item: TItem, error: unknown) => void;
    onBatchDone?: (batchIndex: number, total: number, ok: number, failed: number) => void;
  }) => Promise<void>;
  stop: () => void;
}

export function useBatchSubmit<TItem>(): UseBatchSubmitReturn<TItem> {
  const [waitState, setWaitState] = useState<BatchWaitState | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const stop = () => { stopRef.current = true; };

  const run: UseBatchSubmitReturn<TItem>["run"] = async ({
    items, batchEnabled, batchSize, delaySec,
    submit, onItemSuccess, onItemError, onBatchDone,
  }) => {
    if (items.length === 0 || running) return;
    stopRef.current = false;
    setRunning(true);

    const size = Math.max(1, batchSize || 1);
    const chunks = batchEnabled
      ? Array.from({ length: Math.ceil(items.length / size) },
                   (_, i) => items.slice(i * size, (i + 1) * size))
      : [items];

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current) break;
        setWaitState({ currentBatch: i + 1, totalBatches: chunks.length, secondsLeft: 0 });
        const chunk = chunks[i];
        const results = await Promise.allSettled(chunk.map(async (it) => {
          try { await submit(it); onItemSuccess?.(it); }
          catch (e) { onItemError?.(it, e); throw e; }
        }));
        const okCount = results.filter((r) => r.status === "fulfilled").length;
        onBatchDone?.(i + 1, chunks.length, okCount, results.length - okCount);

        // Quota-exhausted detection: if EVERY item in this chunk failed
        // with HTTP 429 quota error, the rest of the batch will hit the
        // same wall — stop the loop immediately instead of wasting time
        // submitting another N items that all 429. Code is either
        // `domain_quota_exceeded` or `tool_install_quota_exceeded`
        // depending on which scope owned the cap that ran out.
        const allQuotaDenied = results.length > 0 && results.every((r) => {
          if (r.status !== "rejected") return false;
          const resp = (r.reason as {
            response?: { status?: number; data?: { detail?: { code?: string } } };
          })?.response;
          if (resp?.status !== 429) return false;
          const code = resp.data?.detail?.code ?? "";
          return code === "domain_quota_exceeded" || code === "tool_install_quota_exceeded";
        });
        if (allQuotaDenied) {
          stopRef.current = true;
          break;
        }

        if (i < chunks.length - 1 && delaySec > 0 && !stopRef.current) {
          for (let s = delaySec; s > 0; s--) {
            if (stopRef.current) break;
            setWaitState({ currentBatch: i + 1, totalBatches: chunks.length, secondsLeft: s });
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    } finally {
      setWaitState(null);
      setRunning(false);
      stopRef.current = false;
    }
  };

  return { waitState, running, run, stop };
}

// ─── Settings persistence ──────────────────────────────────────────────────
//
// Mirror useState into localStorage so panel settings (ratio, duration,
// folder path, etc.) survive a reload. Without this the user re-picks
// everything on every refresh.

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) as T : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* quota / private mode — best-effort */ }
  }, [key, value]);
  return [value, setValue];
}

// ─── Electron IPC helpers ──────────────────────────────────────────────────
// The desktop wrapper exposes a tiny window.grokflowDesktop API via
// preload.js. Helpers degrade gracefully when running in a browser.

interface DesktopAPI {
  isDesktop: true;
  platform: string;
  hostname?: string;
  toolId?: string | null;
  openFolder?: (path: string) => Promise<{ ok: boolean; error?: string }>;
}

export function getDesktopAPI(): DesktopAPI | undefined {
  return (window as unknown as { grokflowDesktop?: DesktopAPI }).grokflowDesktop;
}


/** Parse a JSON file or `.txt` newline-separated file into prompt strings.
 *  Accepts either:
 *    ["prompt 1", "prompt 2", ...]
 *    [{"prompt": "..."}, {"prompt": "..."}, ...]
 *    "prompt 1\nprompt 2\n..."   (plain text) */
export async function parsePromptFile(file: File): Promise<string[]> {
  const text = await file.text();
  const trimmed = text.trim();
  if (!trimmed) return [];
  // JSON first.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => typeof x === "string" ? x : (x?.prompt ?? x?.text ?? ""))
          .filter((s: string) => typeof s === "string" && s.trim());
      }
      // Single object → look for prompts/prompt list
      if (parsed.prompts && Array.isArray(parsed.prompts)) {
        return parsed.prompts.filter((s: any) => typeof s === "string" && s.trim());
      }
    } catch {
      /* fall through to newline split */
    }
  }
  // Newline-separated fallback.
  return trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}
