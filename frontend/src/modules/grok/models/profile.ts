export interface Profile {
  id: string;
  name: string;
  provider: string;
  status: string;
  last_login_check_at: string | null;
  last_used_at: string | null;
  active_jobs: number;
  max_concurrent_jobs: number;
  active_video_jobs: number;
  max_concurrent_video: number;
  allows_video: boolean;
  created_at: string;
}
