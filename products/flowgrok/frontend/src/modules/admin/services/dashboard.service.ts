import { api } from "@/core/api/axios";

import type { DashboardData, TenantDashboardData, JobLite } from "../models/dashboard";

export const dashboardService = {
  /** Super_admin / admin dashboard — accepts `period` + optional `domain_id`. */
  admin: (params: Record<string, string>) =>
    api
      .get<DashboardData>("/api/dashboard/admin", { params })
      .then((r) => r.data),

  /** Per-user dashboard — same shape as admin (so the switch component
   *  can use either) but server-scoped to the caller. */
  me: (params: Record<string, string>) =>
    api
      .get<DashboardData>("/api/dashboard/me", { params })
      .then((r) => r.data),

  /** Tenant home page — slim payload, no app breakdown. */
  tenantMe: (params: Record<string, string>) =>
    api
      .get<TenantDashboardData>("/api/dashboard/me", { params })
      .then((r) => r.data),

  /** Recent jobs widget on TenantDashboardPage. */
  recentJobs: (limit: number) =>
    api
      .get<JobLite[]>("/api/jobs", { params: { limit } })
      .then((r) => r.data),
};
