import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch, GitCommit, RefreshCw, Rocket, AlertCircle, CheckCircle2,
  Server, Loader2, Plus, Pencil, Trash2,
} from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { AdminGuard } from "./AdminGuard";

interface Commit {
  hash: string; short: string; author: string; date: string; message: string;
}
interface ContainerInfo {
  name: string; status: string; image_id: string | null; started_at: string | null;
}
interface GitRepoRow {
  id: string;
  label: string;
  github_repo: string;
  branch: string;
  local_path: string;
  compose_file: string | null;
  env_file: string | null;
  services: string[];
  sort_order: number;
}
interface Status {
  repo: GitRepoRow;
  branch: string;
  current_commit: Commit | null;
  recent_commits: Commit[];
  remote_latest: Commit | null;
  commits_behind: number | null;
  is_dirty: boolean;
  containers: ContainerInfo[];
}
interface DeployResult {
  ok: boolean; duration_seconds: number; log: string;
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GitRepoRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: repos, isLoading } = useQuery({
    queryKey: ["git-repos"],
    queryFn: async () => (await api.get<GitRepoRow[]>("/api/admin/git/repos")).data,
  });

  // Auto-select first repo when loaded
  useEffect(() => {
    if (repos && repos.length > 0 && !activeId) {
      setActiveId(repos[0].id);
    }
  }, [repos, activeId]);

  const removeRepo = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/git/repos/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["git-repos"] });
      if (activeId === id) setActiveId(null);
      toast("Đã xóa repo", "success");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Admin — Git / Deploy</h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo repo
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : !repos || repos.length === 0 ? (
        <div className="card text-center py-8 text-slate-500">
          Chưa có git repo nào. Click "Tạo repo" để thêm.
        </div>
      ) : (
        <>
          {/* Tab strip */}
          <div className="flex gap-1 border-b border-slate-200 flex-wrap">
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 transition group ${
                  activeId === r.id
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <GitBranch size={14} />
                {r.label}
                <span
                  className="ml-1 text-slate-300 hover:text-rose-500 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(r);
                  }}
                  title="Sửa repo"
                >
                  <Pencil size={12} />
                </span>
              </button>
            ))}
          </div>

          {activeId && (
            <RepoPanel repoId={activeId} key={activeId} />
          )}
        </>
      )}

      {(editing || creating) && (
        <RepoEditorModal
          repo={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onDelete={editing ? (id) => {
            if (confirm(`Xóa repo "${editing.label}"?`)) {
              removeRepo.mutate(id);
              setEditing(null);
            }
          } : undefined}
        />
      )}
    </div>
  );
}

// ============================================================================
// Repo panel — status + deploy for one repo
// ============================================================================

type RepoSubTab = "status" | "deploy" | "containers" | "history" | "env";

function RepoPanel({ repoId }: { repoId: string }) {
  const qc = useQueryClient();
  const [pull, setPull] = useState(true);
  const [rebuild, setRebuild] = useState(true);
  const [selectedServices, setSelectedServices] = useState<string[] | null>(null);
  const [lastResult, setLastResult] = useState<DeployResult | null>(null);
  const [subTab, setSubTab] = useState<RepoSubTab>("status");

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["git-status", repoId],
    queryFn: async () => (await api.get<Status>(`/api/admin/git/repos/${repoId}/status`)).data,
    refetchInterval: 30000,
  });

  // Default selected services to repo's configured set
  useEffect(() => {
    if (status && selectedServices === null) {
      setSelectedServices(status.repo.services);
    }
  }, [status, selectedServices]);

  const deploy = useMutation({
    mutationFn: async () =>
      (await api.post<DeployResult>(`/api/admin/git/repos/${repoId}/deploy`, {
        services: selectedServices, pull, rebuild,
      })).data,
    onSuccess: (res) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["git-status", repoId] });
      toast(res.ok ? "Deploy thành công" : "Deploy lỗi — xem log", res.ok ? "success" : "error");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Deploy lỗi", "error"),
  });

  const toggleService = (s: string) => {
    setSelectedServices((prev) => {
      const current = prev ?? [];
      return current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    });
  };

  const isUpdated = status && status.commits_behind === 0;
  const behindCount = status?.commits_behind ?? null;

  if (isLoading || !status) {
    return <p className="text-slate-500">Đang tải...</p>;
  }

  const serviceChoices = status.repo.services.length > 0
    ? status.repo.services
    : ["backend", "frontend", "worker", "idle-cleanup"];

  // Sub-tab strip — sits between the repo-level tab strip above and the
  // sectioned content below. Keeps the vertical stack scannable as each
  // repo grows more diagnostics.
  const SUBTABS: { key: RepoSubTab; label: string }[] = [
    { key: "status",     label: "Trạng thái" },
    { key: "deploy",     label: "Deploy" },
    { key: "containers", label: "Containers" },
    { key: "history",    label: "Lịch sử" },
    { key: "env",        label: "Env" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-500">
          <span className="font-mono">{status.repo.github_repo}</span>
          <span className="mx-2">·</span>
          <span className="font-mono">{status.repo.local_path}</span>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Sub-tab strip */}
      <div className="flex gap-1 border-b border-slate-200">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`relative px-3 py-1.5 text-sm font-medium transition ${
              subTab === t.key ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {subTab === t.key && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {subTab === "status" && (<>
      {/* Status banner */}
      <div
        className={`card flex items-start gap-3 ${
          isUpdated ? "border-emerald-200 bg-emerald-50/30"
          : behindCount && behindCount > 0 ? "border-amber-200 bg-amber-50/30"
          : ""
        }`}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
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
              <span className="ml-2 text-rose-600 font-medium">⚠ working tree dirty</span>
            )}
          </p>
        </div>
      </div>

      {/* Current + remote commit cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        <CommitCard title="Commit đang chạy trên VPS" commit={status.current_commit} />
        <CommitCard title="Commit mới nhất trên GitHub" commit={status.remote_latest} />
      </div>
      </>)}

      {subTab === "deploy" && (<>
      {/* Deploy controls */}
      <section className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Rocket size={16} className="text-brand-600" /> Deploy
        </h2>

        <div>
          <div className="text-sm font-medium mb-1.5">Services</div>
          <div className="flex flex-wrap gap-2">
            {serviceChoices.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleService(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  (selectedServices ?? []).includes(s)
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
              if (!confirm(`Deploy ${status.repo.label}? Quá trình mất 1-3 phút.`)) return;
              deploy.mutate();
            }}
            disabled={deploy.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {deploy.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Đang deploy...</>
            ) : (
              <><Rocket size={14} /> Deploy now</>
            )}
          </button>
          {deploy.isPending && (
            <span className="text-xs text-slate-500">Có thể mất 1-3 phút. Không đóng tab.</span>
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
      </>)}

      {subTab === "containers" && (<>
      {/* Containers */}
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
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Không thấy container nào (kiểm tra label / docker-compose project name).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>)}

      {subTab === "history" && (
        <section className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <GitCommit size={16} /> 10 commit gần nhất
          </h2>
          <div className="space-y-1">
            {status.recent_commits.map((c) => (
              <div key={c.hash} className="border border-slate-200 rounded px-3 py-2 text-sm hover:bg-slate-50">
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
      )}

      {subTab === "env" && <RepoEnvTab repoId={repoId} />}
    </div>
  );
}

// ─── Env editor tab — GET/PUT /api/admin/git/repos/{id}/env ────────────
function RepoEnvTab({ repoId }: { repoId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["git-env", repoId],
    queryFn: async () =>
      (await api.get<{ env: string; path: string }>(`/api/admin/git/repos/${repoId}/env`)).data,
  });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (content: string) =>
      api.put(`/api/admin/git/repos/${repoId}/env`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["git-env", repoId] });
      setDraft(null);
      toast("Đã lưu .env. Restart container để áp dụng.", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi lưu .env", "error"),
  });

  if (isLoading || !data) return <p className="text-slate-500">Đang tải .env...</p>;
  const current = draft ?? data.env;
  return (
    <section className="card space-y-3">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">Environment variables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            File: <code className="font-mono">{data.path}</code>. Sửa rồi <strong>Lưu</strong>;
            container đang chạy KHÔNG tự reload — phải tab Deploy bấm "Deploy now" để pick up.
          </p>
        </div>
        {draft !== null && (
          <button
            className="btn-ghost text-xs"
            onClick={() => setDraft(null)}
          >
            Hủy thay đổi
          </button>
        )}
      </header>
      <textarea
        className="w-full h-96 font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded border border-slate-700 outline-none focus:border-violet-500"
        value={current}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">
          {current.split("\n").filter((l) => l && !l.startsWith("#")).length} dòng có giá trị
        </span>
        <button
          className="btn-primary"
          disabled={draft === null || save.isPending}
          onClick={() => draft !== null && save.mutate(draft)}
        >
          {save.isPending ? "Đang lưu..." : "Lưu .env"}
        </button>
      </div>
    </section>
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

// ============================================================================
// Editor modal
// ============================================================================

function RepoEditorModal({
  repo, isCreate, onClose, onDelete,
}: {
  repo: GitRepoRow | null;
  isCreate: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(repo?.label ?? "");
  const [githubRepo, setGithubRepo] = useState(repo?.github_repo ?? "");
  const [branch, setBranch] = useState(repo?.branch ?? "main");
  const [localPath, setLocalPath] = useState(repo?.local_path ?? "");
  const [composeFile, setComposeFile] = useState(repo?.compose_file ?? "");
  const [envFile, setEnvFile] = useState(repo?.env_file ?? "");
  const [servicesText, setServicesText] = useState((repo?.services ?? []).join(", "));
  const [sortOrder, setSortOrder] = useState(repo?.sort_order ?? 0);

  const save = useMutation({
    mutationFn: async () => {
      const services = servicesText.split(",").map((s) => s.trim()).filter(Boolean);
      const payload = {
        label, github_repo: githubRepo, branch, local_path: localPath,
        compose_file: composeFile || null,
        env_file: envFile || null,
        services, sort_order: sortOrder,
      };
      return isCreate
        ? api.post("/api/admin/git/repos", payload)
        : api.patch(`/api/admin/git/repos/${repo!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["git-repos"] });
      toast(isCreate ? "Đã tạo repo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-3">
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo git repo mới" : `Sửa: ${repo?.label}`}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Label</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="HostFlow" />
          </div>
          <div>
            <label className="text-sm font-medium">GitHub repo</label>
            <input className="input font-mono" value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo" />
          </div>
          <div>
            <label className="text-sm font-medium">Branch</label>
            <input className="input font-mono" value={branch}
              onChange={(e) => setBranch(e.target.value)} placeholder="main" />
          </div>
          <div>
            <label className="text-sm font-medium">Sort order</label>
            <input className="input" type="number" value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Local path trên VPS</label>
          <input className="input font-mono" value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/opt/hostflow" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Compose file</label>
            <input className="input font-mono" value={composeFile}
              onChange={(e) => setComposeFile(e.target.value)}
              placeholder="docker-compose.yml (để trống = default)" />
          </div>
          <div>
            <label className="text-sm font-medium">Env file</label>
            <input className="input font-mono" value={envFile}
              onChange={(e) => setEnvFile(e.target.value)}
              placeholder=".env (để trống = default)" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Services (cách nhau bằng dấu phẩy)</label>
          <input className="input font-mono" value={servicesText}
            onChange={(e) => setServicesText(e.target.value)}
            placeholder="backend, frontend, worker" />
          <p className="text-xs text-slate-500 mt-1">
            Để trống = tất cả services trong compose file.
          </p>
        </div>

        <div className="flex justify-between items-center pt-3 border-t">
          {onDelete && repo ? (
            <button
              onClick={() => onDelete(repo.id)}
              className="btn-ghost text-rose-600 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Xóa repo
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Hủy</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !label || !githubRepo || !localPath}
              className="btn-primary"
            >
              {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
