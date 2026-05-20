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
  /** Tier label — "free" / "heavy" / "pro". Free-text, used by admin UI
   *  for filtering + badges. Does NOT affect worker routing. */
  tier: string;
  created_at: string;
}

export const PROFILE_TIERS = ["free", "heavy", "pro"] as const;
export type ProfileTier = (typeof PROFILE_TIERS)[number] | string;
