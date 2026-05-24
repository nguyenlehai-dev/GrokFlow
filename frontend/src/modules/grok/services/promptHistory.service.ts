import { api } from "@/core/api/axios";

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  job_type: string;
  created_at: string;
}

/** Server-synced prompt history. Replaces the localStorage variant that
 *  leaked between accounts on the same machine. Backend is per-user
 *  (Job.user_id) and caps at 50 entries. */
export const promptHistoryService = {
  list: (job_type?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (job_type) params.set("job_type", job_type);
    params.set("limit", String(limit));
    return api
      .get<PromptHistoryEntry[]>(`/api/prompt-history?${params.toString()}`)
      .then((r) => r.data);
  },

  /** Upsert — same prompt for same user updates timestamp instead of dup. */
  add: (prompt: string, job_type: string) =>
    api
      .post<PromptHistoryEntry>("/api/prompt-history", { prompt, job_type })
      .then((r) => r.data),

  removeOne: (id: string) => api.delete(`/api/prompt-history/${id}`),

  clearAll: () => api.delete("/api/prompt-history"),
};
