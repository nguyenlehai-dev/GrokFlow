import { useQuery } from "@tanstack/react-query";
import { usersService } from "../services/users.service";

export function StatsBlock() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => usersService.stats(),
  });
  if (!stats) return null;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Stat label="Users" value={stats.total_users} />
      <Stat label="API Keys" value={stats.total_api_keys} />
      <Stat label="Profiles" value={stats.total_profiles} />
      <Stat label="Tổng job" value={stats.total_jobs} />
      <Stat label="Job 24h success" value={stats.jobs_24h_success} accent="text-emerald-600" />
      <Stat label="Job 24h failed" value={stats.jobs_24h_failed} accent="text-rose-600" />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}
