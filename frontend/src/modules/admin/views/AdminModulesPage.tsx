import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, RefreshCw, Trash2, Loader2, CircleCheck, CircleAlert, CirclePause } from "lucide-react";

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

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: () => adminModulesService.list(),
    // Poll while any module is still installing so the UI reflects status.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((m: AdminModuleRow) => m.status === "installing") ? 3000 : false,
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Boxes size={20} className="text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-800">Module marketplace</h1>
        </div>
        <button
          onClick={() => setInstalling(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Install module
        </button>
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
  const restart = useMutation({
    mutationFn: (id: string) => adminModulesService.restart(id),
    onSuccess: () => { toast("Module restarted", "success"); onChanged(); },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Restart failed", "error"),
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
              <td className="px-4 py-2 text-right space-x-2">
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
                    if (confirm(`Uninstall ${m.slug}? Schema mod_${m.slug} sẽ bị xoá.`)) {
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
    </div>
  );
}


function StatusBadge({ status }: { status: AdminModuleRow["status"] }) {
  const map = {
    installing: { icon: <Loader2 size={12} className="animate-spin" />, color: "bg-amber-50 text-amber-700 border-amber-200", label: "Installing" },
    running:    { icon: <CircleCheck size={12} />,                       color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Running" },
    stopped:    { icon: <CirclePause size={12} />,                       color: "bg-slate-50 text-slate-600 border-slate-200", label: "Stopped" },
    error:      { icon: <CircleAlert size={12} />,                       color: "bg-rose-50 text-rose-700 border-rose-200", label: "Error" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${map.color}`}>
      {map.icon} {map.label}
    </span>
  );
}


function InstallModal({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [gitUrl, setGitUrl] = useState("");
  const [gitRef, setGitRef] = useState("main");
  const [pat, setPat] = useState("");

  const install = useMutation({
    mutationFn: () => adminModulesService.install({
      git_url: gitUrl.trim(),
      git_ref: gitRef.trim() || "main",
      github_pat: pat.trim() || null,
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
          <span className="text-sm font-medium text-slate-700">GitHub PAT (nếu repo private)</span>
          <input
            type="password" value={pat} onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            className="input mt-1 w-full font-mono text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Token được mã hoá Fernet trước khi lưu. Cần scope <code>repo</code> để clone private.
          </p>
        </label>

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
