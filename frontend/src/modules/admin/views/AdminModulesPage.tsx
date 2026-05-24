import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, RefreshCw, Trash2, Loader2, CircleCheck, CircleAlert, CirclePause, FileText, ArrowUpCircle, Settings, X, Sparkles } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { AdminGuard } from "../components/AdminGuard";
import {
  adminModulesService,
  type AdminModuleRow,
} from "../services/modules.service";

export function AdminModulesPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [installing, setInstalling] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: () => adminModulesService.list(),
    // Poll while any module is still installing/updating so the UI reflects status.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((m: AdminModuleRow) => m.status === "installing" || m.status === "updating") ? 3000 : false,
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Boxes size={20} className="text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-800">Module marketplace</h1>
        </div>
        <div className="space-x-2">
          <button
            onClick={() => setCreating(true)}
            className="btn-ghost border border-violet-200 text-violet-700 inline-flex items-center gap-1.5"
          >
            <Sparkles size={14} /> Create new
          </button>
          <button
            onClick={() => setInstalling(true)}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Install module
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        Paste URL của 1 git repo theo SDK contract → core sẽ clone, build, spawn container,
        provision schema riêng, và inject vào sidebar admin. Xem chi tiết ở{" "}
        <code className="bg-slate-100 px-1 rounded">docs/MODULE-MARKETPLACE.md</code>.
      </p>

      {isLoading ? (
        <div className="text-sm text-slate-500">Đang tải…</div>
      ) : modules.length === 0 ? (
        <EmptyState onInstall={() => setInstalling(true)} />
      ) : (
        <ModuleTable modules={modules} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-modules"] })} />
      )}

      {installing && (
        <InstallModal
          onClose={() => setInstalling(false)}
          onInstalled={() => {
            setInstalling(false);
            qc.invalidateQueries({ queryKey: ["admin-modules"] });
          }}
        />
      )}
      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["admin-modules"] });
          }}
        />
      )}
    </div>
  );
}


function EmptyState({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
      <Boxes size={40} className="text-slate-400 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-slate-700">Chưa có module nào</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Module là 1 git repo theo contract trong SDK. Install để thêm vào sidebar admin.
      </p>
      <button onClick={onInstall} className="btn-primary inline-flex items-center gap-1.5 mt-4">
        <Plus size={14} /> Install module đầu tiên
      </button>
    </div>
  );
}


function ModuleTable({ modules, onChanged }: { modules: AdminModuleRow[]; onChanged: () => void }) {
  const [logsFor, setLogsFor] = useState<AdminModuleRow | null>(null);
  const [settingsFor, setSettingsFor] = useState<AdminModuleRow | null>(null);

  const restart = useMutation({
    mutationFn: (id: string) => adminModulesService.restart(id),
    onSuccess: () => { toast("Module restarted", "success"); onChanged(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Restart failed", "error"),
  });
  const updateMod = useMutation({
    mutationFn: (id: string) => adminModulesService.update(id),
    onSuccess: () => { toast("Module updating — đợi vài phút", "success"); onChanged(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Update failed", "error"),
  });
  const uninstall = useMutation({
    mutationFn: (id: string) => adminModulesService.uninstall(id),
    onSuccess: () => { toast("Module uninstalled", "success"); onChanged(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Uninstall failed", "error"),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Module</th>
            <th className="px-4 py-2">Version</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2">Schema</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {modules.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2"><StatusBadge status={m.status} /></td>
              <td className="px-4 py-2">
                <div className="font-medium text-slate-800">{m.manifest?.menu?.label ?? m.slug}</div>
                <div className="text-xs text-slate-500 font-mono">{m.slug}</div>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-slate-600">{m.version}</td>
              <td className="px-4 py-2 text-xs text-slate-600 truncate max-w-xs" title={m.git_url}>
                {m.git_url}
                <span className="text-slate-400"> @ {m.git_ref}</span>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-slate-600">{m.db_schema}</td>
              <td className="px-4 py-2 text-right space-x-1.5">
                <button
                  className="btn-ghost btn-sm inline-flex items-center gap-1"
                  onClick={() => setLogsFor(m)}
                  title="View backend logs"
                >
                  <FileText size={13} /> Logs
                </button>
                <button
                  className="btn-ghost btn-sm inline-flex items-center gap-1"
                  onClick={() => setSettingsFor(m)}
                  title="Module settings"
                >
                  <Settings size={13} /> Settings
                </button>
                <button
                  className="btn-ghost btn-sm inline-flex items-center gap-1"
                  onClick={() => {
                    if (confirm(`Pull commit mới nhất từ ${m.git_ref}, rebuild, swap containers?`)) {
                      updateMod.mutate(m.id);
                    }
                  }}
                  disabled={updateMod.isPending || m.status === "installing" || m.status === "updating"}
                  title="Pull + rebuild + swap"
                >
                  <ArrowUpCircle size={13} /> Update
                </button>
                <button
                  className="btn-ghost btn-sm inline-flex items-center gap-1"
                  onClick={() => restart.mutate(m.id)}
                  disabled={restart.isPending}
                  title="Restart containers"
                >
                  <RefreshCw size={13} /> Restart
                </button>
                <button
                  className="btn-ghost btn-sm text-rose-600 inline-flex items-center gap-1"
                  onClick={() => {
                    if (confirm(`Uninstall ${m.slug}? Schema ${m.db_schema} sẽ bị xoá.`)) {
                      uninstall.mutate(m.id);
                    }
                  }}
                  disabled={uninstall.isPending}
                >
                  <Trash2 size={13} /> Uninstall
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logsFor && <LogsModal module={logsFor} onClose={() => setLogsFor(null)} />}
      {settingsFor && <SettingsModal module={settingsFor} onClose={() => setSettingsFor(null)} onSaved={() => { setSettingsFor(null); onChanged(); }} />}
    </div>
  );
}


function LogsModal({ module, onClose }: { module: AdminModuleRow; onClose: () => void }) {
  const [kind, setKind] = useState<"fe" | "be">("be");
  const { data: logs = "", isFetching, refetch } = useQuery({
    queryKey: ["module-logs", module.id, kind],
    queryFn: () => adminModulesService.logs(module.id, kind, 500),
    refetchInterval: 5000,
  });
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold text-slate-800 inline-flex items-center gap-2">
            <FileText size={16} /> Logs — {module.slug}
            <select value={kind} onChange={(e) => setKind(e.target.value as "fe" | "be")} className="input ml-2 text-xs py-1">
              <option value="be">Backend</option>
              <option value="fe">Frontend (nginx)</option>
            </select>
            {isFetching && <Loader2 size={12} className="animate-spin text-slate-400" />}
          </div>
          <div className="space-x-2">
            <button onClick={() => refetch()} className="btn-ghost btn-sm" title="Reload">
              <RefreshCw size={13} />
            </button>
            <button onClick={onClose} className="btn-ghost btn-sm" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs font-mono bg-slate-950 text-slate-100 whitespace-pre-wrap">
          {logs || "(no logs yet)"}
        </pre>
      </div>
    </div>
  );
}


function SettingsModal({ module, onClose, onSaved }: { module: AdminModuleRow; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(JSON.stringify(module.settings ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      try {
        const parsed = JSON.parse(value);
        return adminModulesService.updateSettings(module.id, parsed);
      } catch (e: any) {
        throw new Error(`Invalid JSON: ${e?.message ?? e}`);
      }
    },
    onSuccess: () => { toast("Settings saved", "success"); onSaved(); },
    onError: (e: any) => setError(e?.message ?? e?.response?.data?.detail?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 inline-flex items-center gap-2">
            <Settings size={16} /> Settings — {module.slug}
          </h2>
          <button onClick={onClose} className="btn-ghost btn-sm"><X size={14} /></button>
        </div>
        <p className="text-xs text-slate-500">
          JSON blob. Module BE đọc qua <code>GET /api/sdk/settings</code> (đã verify service token).
        </p>
        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          spellCheck={false}
          className="input w-full font-mono text-xs h-64"
        />
        {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">{error}</div>}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary text-sm inline-flex items-center gap-1.5">
            {save.isPending ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


function StatusBadge({ status }: { status: AdminModuleRow["status"] }) {
  const map: Record<AdminModuleRow["status"], { icon: JSX.Element; color: string; label: string }> = {
    installing: { icon: <Loader2 size={12} className="animate-spin" />, color: "bg-amber-50 text-amber-700 border-amber-200", label: "Installing" },
    updating:   { icon: <Loader2 size={12} className="animate-spin" />, color: "bg-sky-50 text-sky-700 border-sky-200", label: "Updating" },
    running:    { icon: <CircleCheck size={12} />,                       color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Running" },
    stopped:    { icon: <CirclePause size={12} />,                       color: "bg-slate-50 text-slate-600 border-slate-200", label: "Stopped" },
    error:      { icon: <CircleAlert size={12} />,                       color: "bg-rose-50 text-rose-700 border-rose-200", label: "Error" },
  };
  const m = map[status] ?? map.error;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}


function InstallModal({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [gitUrl, setGitUrl] = useState("");
  const [gitRef, setGitRef] = useState("main");
  const [pat, setPat] = useState("");
  const [autoScaffold, setAutoScaffold] = useState(false);
  const [moduleLabel, setModuleLabel] = useState("");

  const install = useMutation({
    mutationFn: () => adminModulesService.install({
      git_url: gitUrl.trim(),
      git_ref: gitRef.trim() || "main",
      github_pat: pat.trim() || null,
      auto_scaffold: autoScaffold,
      module_label: moduleLabel.trim() || null,
    }),
    onSuccess: () => { toast("Module đang được install — theo dõi status ở bảng", "success"); onInstalled(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Install failed", "error"),
  });

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Install module from Git</h2>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Repository URL</span>
          <input
            autoFocus value={gitUrl} onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="input mt-1 w-full font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Branch / tag</span>
          <input
            value={gitRef} onChange={(e) => setGitRef(e.target.value)}
            placeholder="main"
            className="input mt-1 w-full font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">GitHub PAT (nếu repo private hoặc cần auto-scaffold)</span>
          <input
            type="password" value={pat} onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            className="input mt-1 w-full font-mono text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Token mã hoá Fernet trước khi lưu. Scope <code>repo</code> (read) cho clone, scope <code>repo</code> (write) nếu bật scaffold.
          </p>
        </label>

        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox" checked={autoScaffold}
              onChange={(e) => setAutoScaffold(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-800 inline-flex items-center gap-1">
                <Sparkles size={13} className="text-violet-600" /> Auto-scaffold nếu repo trống
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Nếu repo chưa có <code>module.manifest.json</code>, core sẽ copy template Hello World vào + commit + push lên repo của bạn. PAT cần write scope.
              </p>
            </div>
          </label>
          {autoScaffold && (
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Module label (hiển thị trên sidebar)</span>
              <input
                value={moduleLabel} onChange={(e) => setModuleLabel(e.target.value)}
                placeholder="My Cool Module"
                className="input mt-1 w-full text-sm"
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button
            onClick={() => install.mutate()}
            disabled={!gitUrl.trim() || install.isPending}
            className="btn-primary inline-flex items-center gap-1.5 text-sm"
          >
            {install.isPending ? <><Loader2 size={14} className="animate-spin"/> Cloning…</> : <>Install</>}
          </button>
        </div>
      </div>
    </div>
  );
}


function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [pat, setPat] = useState("");
  const [label, setLabel] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const create = useMutation({
    mutationFn: () => adminModulesService.createAndInstall({
      github_owner: owner.trim(),
      github_repo: repo.trim(),
      github_pat: pat.trim(),
      private: isPrivate,
      module_label: label.trim() || null,
    }),
    onSuccess: () => { toast("Module đang được tạo + scaffold + install", "success"); onCreated(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Create failed", "error"),
  });

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 inline-flex items-center gap-2">
            <Sparkles size={16} className="text-violet-600" /> Create new module
          </h2>
          <button onClick={onClose} className="btn-ghost btn-sm"><X size={14} /></button>
        </div>
        <p className="text-xs text-slate-500">
          Tạo 1 repo GitHub mới + scaffold từ Hello World template + install. Bạn không phải tự tạo repo.
          Cần PAT scope <code>repo</code> (write).
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">GitHub owner</span>
            <input
              value={owner} onChange={(e) => setOwner(e.target.value)}
              placeholder="username or org"
              className="input mt-1 w-full font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Repo name</span>
            <input
              value={repo} onChange={(e) => setRepo(e.target.value)}
              placeholder="my-module"
              className="input mt-1 w-full font-mono text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">GitHub PAT (write scope)</span>
          <input
            type="password" value={pat} onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            className="input mt-1 w-full font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sidebar label</span>
          <input
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="My Cool Module (default: repo name)"
            className="input mt-1 w-full text-sm"
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox" checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <span>Tạo repo private</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!owner.trim() || !repo.trim() || !pat.trim() || create.isPending}
            className="btn-primary inline-flex items-center gap-1.5 text-sm"
          >
            {create.isPending ? <><Loader2 size={14} className="animate-spin"/> Creating…</> : <>Create & install</>}
          </button>
        </div>
      </div>
    </div>
  );
}
