import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/axios";

interface Counts {
  apiKeys: number;
  profiles: number;
  profilesLoggedIn: number;
  needLogin: number;
  totalSlots: number;
  usedSlots: number;
  jobsTotal: number;
  jobsQueued: number;
  jobsRunning: number;
  jobsSuccess: number;
  jobsFailed: number;
}

async function fetchCounts(): Promise<Counts> {
  const [keys, profiles, jobs] = await Promise.all([
    api.get("/api/api-keys"),
    api.get("/api/profiles"),
    api.get("/api/jobs?limit=500"),
  ]);
  const ps = profiles.data as any[];
  const js = jobs.data as any[];
  return {
    apiKeys: keys.data.length,
    profiles: ps.length,
    profilesLoggedIn: ps.filter((p) => p.status === "logged_in" || p.status === "running_job").length,
    needLogin: ps.filter((p) => p.status === "need_login").length,
    totalSlots: ps.reduce((sum, p) => sum + (p.max_concurrent_jobs ?? 1), 0),
    usedSlots: ps.reduce((sum, p) => sum + (p.active_jobs ?? 0), 0),
    jobsTotal: js.length,
    jobsQueued: js.filter((j) => j.status === "queued").length,
    jobsRunning: js.filter((j) => ["running", "processing_provider", "uploading_result"].includes(j.status)).length,
    jobsSuccess: js.filter((j) => j.status === "success").length,
    jobsFailed: js.filter((j) => j.status === "failed").length,
  };
}

function Stat({ label, value, accent, sub }: {
  label: string; value: number | string; accent?: string; sub?: string;
}) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchCounts,
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-xs text-slate-400">Auto-refresh mỗi 5s</span>
      </div>
      {isLoading && !data ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error && !data ? (
        <div className="card text-rose-600 text-sm">
          Không tải được dashboard: {(error as any)?.message ?? "lỗi không xác định"}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat
              label="Slot pool"
              value={`${data.usedSlots}/${data.totalSlots}`}
              sub={`${data.profilesLoggedIn} profile sẵn sàng`}
              accent={data.totalSlots > 0 && data.usedSlots / data.totalSlots >= 1 ? "text-rose-600"
                : data.totalSlots > 0 && data.usedSlots / data.totalSlots >= 0.7 ? "text-amber-600"
                : "text-emerald-600"}
            />
            <Stat label="Đang chờ" value={data.jobsQueued} accent="text-blue-600" />
            <Stat label="Đang chạy" value={data.jobsRunning} accent="text-amber-600" />
            <Stat
              label="Profile cần login lại"
              value={data.needLogin}
              accent={data.needLogin > 0 ? "text-rose-600" : "text-slate-900"}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Tổng job" value={data.jobsTotal} />
            <Stat label="Thành công" value={data.jobsSuccess} accent="text-emerald-600" />
            <Stat label="Lỗi" value={data.jobsFailed} accent="text-rose-600" />
            <Stat label="API Keys" value={data.apiKeys} />
          </div>
        </>
      ) : null}
    </div>
  );
}
