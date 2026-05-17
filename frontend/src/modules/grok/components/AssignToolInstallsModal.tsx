import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Monitor, Save } from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import type { Project } from "../models/project";
import { projectsService } from "../services/projects.service";

interface ToolInstallLite {
  id: string;
  tool_id: string;
  machine_name: string | null;
  label: string | null;
  status: string;
}

/** Sibling of AssignDomainsModal — gates a Grok project to specific
 *  desktop installs instead of tenant domains. Only ACTIVE installs are
 *  selectable; pending/disabled rows are filtered out so admin can't
 *  accidentally grant access before approving. */
export function AssignToolInstallsModal({
  project, onClose,
}: { project: Project; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: installs = [] } = useQuery({
    queryKey: ["admin-tool-installs-light"],
    queryFn: () =>
      api
        .get<ToolInstallLite[]>("/api/admin/auth/tool-installs", { params: { status: "active" } })
        .then((r) => r.data),
  });

  const { data: current, isLoading } = useQuery({
    queryKey: ["grok-project-tool-installs", project.id],
    queryFn: () => projectsService.getToolInstalls(project.id),
  });

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const effective = selected ?? new Set(current?.tool_install_ids ?? []);

  const save = useMutation({
    mutationFn: () => projectsService.setToolInstalls(project.id, Array.from(effective)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-project-tool-installs", project.id] });
      qc.invalidateQueries({ queryKey: ["grok-projects", project.profile_id] });
      toast("Đã lưu phân quyền tool installs", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi lưu", "error"),
  });

  const toggle = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Monitor size={16} className="text-violet-600" /> Phân quyền Tool Installs
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Project <code className="font-mono">{project.name}</code> → máy nào được dùng
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Đang tải...</p>
          ) : installs.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có Tool Install nào active. Vào Auth → Tool Installs để duyệt máy trước.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {installs.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-white">
                    <input
                      type="checkbox"
                      checked={effective.has(t.id)}
                      onChange={() => toggle(t.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">
                        {t.label ?? <span className="italic text-slate-400">Chưa đặt tên</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t.machine_name ?? "?"} · <code className="font-mono">{t.tool_id.slice(0, 12)}…</code>
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Save size={14} /> {save.isPending ? "Đang lưu..." : `Lưu (${effective.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
