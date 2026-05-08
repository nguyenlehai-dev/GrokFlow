import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/axios";

interface Counts {
  apiKeys: number;
  profiles: number;
  jobsTotal: number;
  jobsSuccess: number;
  jobsFailed: number;
  needLogin: number;
}

async function fetchCounts(): Promise<Counts> {
  const [keys, profiles, jobs] = await Promise.all([
    api.get("/api/api-keys"),
    api.get("/api/profiles"),
    api.get("/api/jobs?limit=200"),
  ]);
  return {
    apiKeys: keys.data.length,
    profiles: profiles.data.length,
    jobsTotal: jobs.data.length,
    jobsSuccess: jobs.data.filter((j: any) => j.status === "success").length,
    jobsFailed: jobs.data.filter((j: any) => j.status === "failed").length,
    needLogin: profiles.data.filter((p: any) => p.status === "need_login").length,
  };
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchCounts });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="API Keys" value={data!.apiKeys} />
          <Stat label="Profiles" value={data!.profiles} />
          <Stat label="Profile cần login lại" value={data!.needLogin} accent="text-amber-600" />
          <Stat label="Tổng job" value={data!.jobsTotal} />
          <Stat label="Job thành công" value={data!.jobsSuccess} accent="text-emerald-600" />
          <Stat label="Job lỗi" value={data!.jobsFailed} accent="text-rose-600" />
        </div>
      )}
    </div>
  );
}
