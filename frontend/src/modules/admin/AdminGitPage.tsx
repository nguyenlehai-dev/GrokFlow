import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch, GitCommit, RefreshCw, Rocket, AlertCircle, CheckCircle2,
  Server, Loader2,
} from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { AdminGuard } from "./AdminGuard";

interface Commit {
  hash: string;
  short: string;
  author: string;
  date: string;
  message: string;
}

interface ContainerInfo {
  name: string;
  status: string;
  image_id: string | null;
  started_at: string | null;
}

interface Status {
  branch: string;
  current_commit: Commit | null;
  recent_commits: Commit[];
  remote_latest: Commit | null;
  commits_behind: number | null;
  is_dirty: boolean;
  containers: ContainerInfo[];
}

interface DeployResult {
  ok: boolean;
  duration_seconds: number;
  log: string;
}

export function AdminGitPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [selectedServices, setSelectedServices] = useState<string[]>(["backend", "frontend"]);
  const [pull, setPull] = useState(true);
  const [rebuild, setRebuild] = useState(true);
  const [lastResult, setLastResult] = useState<DeployResult | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["git-status"],
    queryFn: async () => (await api.get<Status>("/api/admin/git/status")).data,
    refetchInterval: 30000,
  });

  const deploy = useMutation({
    mutationFn: async () =>
      (await api.post<DeployResult>("/api/admin/git/deploy", {
        services: selectedServices,
        pull, rebuild,
      })).data,
    onSuccess: (res) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["git-status"] });
      toast(res.ok ? "Deploy thành công" : "Deploy lỗi — xem log", res.ok ? "success" : "error");
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Deploy lỗi", "error");
    },
  });

  const toggleService = (s: string) => {
    setSelectedServices((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const isUpdated = status && status.commits_behind === 0;
  const behindCount = status?.commits_behind ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Admin — Git / Deploy</h1>
        <button
          onClick={() => refetch()}
          className="btn-ghost inline-flex items-center gap-1.5"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {isLoading && !status ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : status ? (
        <>
          {/* Status banner */}
          <div className={`card flex items-start gap-3 ${
            isUpdated ? "border-emerald-200 bg-emerald-50/30"
            : behindCount && behindCount > 0 ? "border-amber-200 bg-amber-50/30"
            : ""
          }`}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                            bg-slate-100">
              {isUpdated
                ? <CheckCircle2 size={20} className="text-emerald-600" />
                : behindCount && behindCount > 0
                ? <AlertCircle size={20} className="text-amber-600" />
                : <GitBranch size={20} className="text-slate-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold">
                {isUpdated
                  ? "✓ Bản triển khai đã mới nhất"
                  : behindCount && behindCount > 0
                  ? `⚠ Đang chậm ${behindCount} commit so với GitHub`
                  : "Trạng thái remote chưa xác định"}
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Branch: <code className="font-mono">{status.branch}</code>
                {status.is_dirty && (
                  <span className="ml-2 text-rose-600 font-medium">⚠ working tree có thay đổi chưa commit</span>
                )}
              </p>
            </div>
          </div>

          {/* Current + remote commits */}
          <div className="grid lg:grid-cols-2 gap-4">
            <CommitCard title="Commit đang chạy trên VPS" commit={status.current_commit} />
            <CommitCard title="Commit mới nhất trên GitHub" commit={status.remote_latest} />
          </div>

          {/* Deploy controls */}
          <section className="card space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Rocket size={16} className="text-brand-600" /> Deploy
            </h2>

            <div>
              <div className="text-sm font-medium mb-1.5">Services</div>
              <div className="flex flex-wrap gap-2">
                {["backend", "frontend", "worker", "idle-cleanup"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition ${
                      selectedServices.includes(s)
                        ? "bg-brand-50 border-brand-500 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pull} onChange={(e) => setPull(e.target.checked)} />
                <span>Git pull trước</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} />
                <span>Rebuild image</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (selectedServices.length === 0) {
                    toast("Chọn ít nhất 1 service", "error");
                    return;
                  }
                  if (!confirm(`Deploy ${selectedServices.join(", ")}? Quá trình mất 1-3 phút.`)) return;
                  deploy.mutate();
                }}
                disabled={deploy.isPending || selectedServices.length === 0}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                {deploy.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Đang deploy...</>
                ) : (
                  <><Rocket size={14} /> Deploy now</>
                )}
              </button>
              {deploy.isPending && (
                <span className="text-xs text-slate-500">
                  Có thể mất 1-3 phút. Không đóng tab này.
                </span>
              )}
            </div>
          </section>

          {/* Deploy log */}
          {lastResult && (
            <section className="card space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  {lastResult.ok
                    ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : <AlertCircle size={16} className="text-rose-600" />}
                  Kết quả deploy gần nhất
                </h3>
                <span className="text-xs text-slate-500">{lastResult.duration_seconds}s</span>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs whitespace-pre-wrap overflow-auto max-h-96">
                {lastResult.log}
              </pre>
            </section>
          )}

          {/* Container statuses */}
          <section className="card space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Server size={16} /> Containers
            </h2>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {status.containers.map((c) => (
                    <tr key={c.name}>
                      <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs ${
                          c.status.toLowerCase().includes("up") && !c.status.includes("unhealthy")
                            ? "text-emerald-700"
                            : c.status.includes("unhealthy") || c.status.toLowerCase().includes("exited")
                            ? "text-rose-700"
                            : "text-slate-600"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{c.started_at ?? "—"}</td>
                    </tr>
                  ))}
                  {status.containers.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Không thấy container nào.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent commits */}
          <section className="card space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <GitCommit size={16} /> 10 commit gần nhất (local)
            </h2>
            <div className="space-y-1">
              {status.recent_commits.map((c) => (
                <div
                  key={c.hash}
                  className="border border-slate-200 rounded px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <code className="font-mono text-xs text-amber-700">{c.short}</code>
                    <span className="text-xs text-slate-500">{c.date}</span>
                  </div>
                  <div className="text-slate-800 mt-0.5 truncate">{c.message}</div>
                  <div className="text-xs text-slate-500">{c.author}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function CommitCard({ title, commit }: { title: string; commit: Commit | null }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-600 mb-2">{title}</h3>
      {commit ? (
        <div className="space-y-1">
          <div className="font-mono text-xs text-amber-700">{commit.short}</div>
          <div className="text-sm font-medium text-slate-900">{commit.message}</div>
          <div className="text-xs text-slate-500">{commit.author}</div>
          <div className="text-xs text-slate-400 font-mono">{commit.date}</div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}
