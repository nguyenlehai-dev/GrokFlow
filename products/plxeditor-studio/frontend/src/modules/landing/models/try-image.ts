export interface TryImageResponse {
  job_id: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  remaining_today: number;
  is_anon: boolean;
}

export interface TryImageQuotaResponse {
  is_anon: boolean;
  daily_cap: number;
  used_today: number;
  remaining: number;
}

export interface TryImagePayload {
  prompt: string;
  aspect: string;
  quality: "speed" | "quality";
}

export interface HistoryItem {
  job_id: string;
  prompt: string;
  result_url: string;
  aspect: string;
  ts: number;
}
