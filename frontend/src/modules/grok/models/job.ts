export interface Job {
  id: string;
  provider: string;
  job_type: string;
  prompt: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  retry_count: number;
  max_retry?: number;
  next_attempt_at?: string | null;
  created_at: string;
  completed_at: string | null;
  is_favorite?: boolean;
  tags?: string[];
}

/** Lighter-weight job projection returned by the Playground submit
 *  endpoint — only the fields the Playground UI needs to render the
 *  "Last submission" card. */
export interface JobOut {
  id: string;
  status: string;
  provider: string;
  job_type: string;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
}

export interface JobFile {
  id: string;
  file_name: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  download_url: string;
}

export interface JobLog {
  level: string;
  message: string;
  context: Record<string, any> | null;
  created_at: string;
}
