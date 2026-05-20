export type Period = "all" | "today" | "week" | "month";

export interface AppItem {
  name: string;
  count: number;
}

export interface AppGroup {
  code: "image" | "video" | "flow" | "gateway" | "mini_app";
  label: string;
  items: AppItem[];
  total: number;
}

export interface RevenuePoint {
  month: string;
  amount: number;
}

export interface JobTimePoint {
  day: string;
  count: number;
}

export interface DomainStats {
  domain_id: string | null;
  hostname: string | null;
  users: number;
  jobs_total: number;
  jobs_image: number;
  jobs_video: number;
  jobs_failed: number;
  jobs_success: number;
  profiles: number;
  api_keys: number;
  revenue: number;
  last_activity: string | null;
}

export interface DashboardTotals {
  jobs_total: number;
  jobs_today: number;
  jobs_success: number;
  jobs_failed: number;
  jobs_queued: number;
  jobs_running: number;
  profiles: number;
  profiles_logged_in: number;
  profiles_need_login: number;
  slots_total: number;
  slots_used: number;
  api_keys: number;
  users: number;
  revenue_total: number;
}

export interface DashboardData {
  period: Period;
  scope: "me" | "admin";
  totals: DashboardTotals;
  app_groups: AppGroup[];
  revenue: RevenuePoint[];
  jobs_timeseries: JobTimePoint[];
  per_domain: DomainStats[];
}

/** Tenant dashboard payload — slimmer than admin DashboardData (no
 *  app_groups / revenue chart series, no per_domain breakdown). */
export interface TenantDashboardData {
  totals: {
    jobs_total: number;
    jobs_today: number;
    jobs_success: number;
    jobs_failed: number;
    jobs_queued: number;
    jobs_running: number;
    profiles: number;
    profiles_logged_in: number;
    slots_total: number;
    slots_used: number;
    api_keys: number;
  };
}

export interface JobLite {
  id: string;
  status: string;
  job_type: string;
  prompt: string;
  created_at: string;
}
