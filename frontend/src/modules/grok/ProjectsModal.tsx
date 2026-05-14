import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Plus, Pencil, Trash2, Layers, Globe, ExternalLink, Save,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

/** Super_admin manages the Grok projects inside a single profile.
 *
 *  - List + add + rename + delete projects (1 row per project)
 *  - Inline "assign domains" per project — multi-select of tenant domains
 *  - Project link to grok.com/project/<slug> for quick verification
 *
 *  Replaces the old ProfileDomainsModal: assignment granularity moved
 *  from profile-level to project-level so a single Grok account can
 *  serve multiple tenants without their chat history bleeding into
 *  each other.
 */

interface Project {
  id: string;
  profile_id: string;
  grok_project_id: string;
  name: string;
  description: string | null;
  domain_count: number;
}

interface Domain {
  id: string;
  hostname: string;
  label: string;
}

export function ProjectsModal({
  profileId, profileName, onClose,
}: { profileId: string; profileName: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["grok-projects", profileId],
    queryFn: async () =>
      (await api.get<Project[]>("/api/grok-projects", { params: { profile_id: profileId } })).data,
  });
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [assigning, setAssigning] = useState<Project | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/grok-projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast("Đã xóa project", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-5 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <Layers size={18} className="text-violet-600" /> Projects của profile
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <code className="font-mono">{profileName}</code> · Mỗi project = 1 workspace
              riêng trong Grok account, có thể assign cho 1 hoặc nhiều domain.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {projects?.length ?? 0} project — bấm + để đăng ký project mới đã tạo trên grok.com
            </p>
            <button
              onClick={() => setCreating(true)}
              className="btn-primary inline-flex items-center gap-1.5 text-sm"
            >
              <Plus size={14} /> Thêm project
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (projects ?? []).length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <ul className="space-y-2">
              {projects?.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing(p)}
                  onAssign={() => setAssigning(p)}
                  onDelete={() => {
                    if (confirm(`Xóa project "${p.name}"? Domain assignments cũng bị xóa.`)) {
                      remove.mutate(p.id);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t px-5 py-3 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Tip: tạo project trên{" "}
            <a href="https://grok.com" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline inline-flex items-center gap-0.5">
              grok.com <ExternalLink size={10} />
            </a>{" "}
            trước, copy URL slug, paste vào đây.
          </span>
          <button onClick={onClose} className="btn-ghost text-sm">Đóng</button>
        </footer>
      </div>

      {creating && (
        <ProjectEditorModal
          profileId={profileId}
          project={null}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ProjectEditorModal
          profileId={profileId}
          project={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {assigning && (
        <AssignDomainsModal
          project={assigning}
          domains={(domains ?? []).filter((d) => d.hostname !== "*")}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────

function ProjectRow({
  p, onEdit, onAssign, onDelete,
}: {
  p: Project;
  onEdit: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-lg ring-1 ring-slate-200 hover:ring-violet-300 bg-white p-3.5 flex items-start justify-between gap-3 transition">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">{p.name}</span>
          <code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            {p.grok_project_id}
          </code>
          <a
            href={`https://grok.com/project/${p.grok_project_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-violet-600 hover:underline inline-flex items-center gap-0.5"
            title="Mở project trên grok.com"
          >
            mở <ExternalLink size={10} />
          </a>
        </div>
        {p.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
        )}
        <div className="mt-2">
          <button
            onClick={onAssign}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900"
          >
            <Globe size={11} /> {p.domain_count} domain assigned · chỉnh ↗
          </button>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={onEdit} className="btn-ghost text-xs" title="Sửa">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="btn-ghost text-xs text-rose-600" title="Xóa">
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
      <Layers size={32} className="mx-auto text-slate-300" />
      <p className="mt-3 font-semibold text-slate-800">Profile này chưa có project nào</p>
      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
        Mở grok.com → tạo project (sidebar trái) → copy URL slug sau{" "}
        <code className="font-mono">/project/</code>. Quay lại đây bấm "Thêm project" + dán slug.
      </p>
      <button onClick={onCreate} className="btn-primary mt-4 inline-flex items-center gap-1.5">
        <Plus size={14} /> Thêm project đầu tiên
      </button>
    </div>
  );
}

// ─── Editor (create / update) ─────────────────────────────────────────────

function ProjectEditorModal({
  profileId, project, onClose,
}: { profileId: string; project: Project | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!project;
  const [grokId, setGrokId] = useState(project?.grok_project_id ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  // Fetch all tenant domains (* fallback excluded) so the user can pick
  // assignments inline at creation. Saves a 2nd modal trip.
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });
  const tenantDomains = (domains ?? []).filter((d) => d.hostname !== "*");

  // For edit mode, prefill the current assignments.
  const { data: currentAssign } = useQuery({
    queryKey: ["grok-project-domains", project?.id],
    queryFn: async () =>
      (await api.get<{ project_id: string; domain_ids: string[] }>(
        `/api/grok-projects/${project!.id}/domains`,
      )).data,
    enabled: isEdit,
  });

  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string> | null>(null);
  const effective = selectedDomainIds ?? new Set(currentAssign?.domain_ids ?? []);
  const toggleDomain = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomainIds(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      // 1) Create or update the project row itself.
      let projectId: string;
      if (isEdit) {
        await api.patch(`/api/grok-projects/${project!.id}`, {
          grok_project_id: grokId.trim() || undefined,
          name: name.trim() || undefined,
          description: description || null,
        });
        projectId = project!.id;
      } else {
        const { data } = await api.post<Project>("/api/grok-projects", {
          profile_id: profileId,
          grok_project_id: grokId.trim(),
          name: name.trim(),
          description: description || null,
        });
        projectId = data.id;
      }
      // 2) Push the domain assignment in the same flow so user doesn't
      // need to re-open the row. Empty array = revoke all.
      await api.put(`/api/grok-projects/${projectId}/domains`, {
        domain_ids: Array.from(effective),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["grok-project-domains", project?.id] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(
        isEdit
          ? `Đã lưu · ${effective.size} domain assigned`
          : `Đã tạo project · ${effective.size} domain assigned`,
        "success",
      );
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] rounded-xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{isEdit ? `Sửa: ${project!.name}` : "Thêm project"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Grok project slug <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1 font-mono"
              value={grokId}
              onChange={(e) => setGrokId(e.target.value)}
              placeholder="vd: 7c8a-tenant-abc"
            />
            <p className="text-xs text-slate-500 mt-1">
              Phần sau <code className="font-mono">/project/</code> trong URL grok.com
            </p>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Tên project <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd: Khách ABC — production"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Mô tả (tùy chọn)</span>
            <textarea
              className="input mt-1"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vd: Brand voice + preset cho khách ABC"
            />
          </label>

          {/* Inline domain assignment so the user doesn't need to open a 2nd
              modal after creating the project. Empty selection = nobody can
              see this project (super_admin only). */}
          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">
                Gán cho domain (tenant)
              </span>
              <span className="text-xs text-slate-500">
                · Project chỉ visible với tenant được tick
              </span>
            </div>
            {tenantDomains.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Chưa có domain tenant — tạo ở /admin/domains trước.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {tenantDomains.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-3 py-1.5 cursor-pointer hover:bg-violet-50"
                  >
                    <input
                      type="checkbox"
                      checked={effective.has(d.id)}
                      onChange={() => toggleDomain(d.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{d.label}</div>
                      <code className="text-[11px] font-mono text-slate-500">{d.hostname}</code>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2">
              Tick = tenant đó dùng được project này.
              Để trống = chỉ super_admin dùng được.
            </p>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-slate-50">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={!grokId.trim() || !name.trim() || save.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Save size={14} />
            {save.isPending
              ? "Đang lưu..."
              : isEdit
              ? `Lưu · ${effective.size} domain`
              : `Tạo · ${effective.size} domain`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Domain assignment modal ──────────────────────────────────────────────

function AssignDomainsModal({
  project, domains, onClose,
}: { project: Project; domains: Domain[]; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: current, isLoading } = useQuery({
    queryKey: ["grok-project-domains", project.id],
    queryFn: async () =>
      (await api.get<{ project_id: string; domain_ids: string[] }>(
        `/api/grok-projects/${project.id}/domains`,
      )).data,
  });
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const effective = selected ?? new Set(current?.domain_ids ?? []);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/grok-projects/${project.id}/domains`, {
        domain_ids: Array.from(effective),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-project-domains", project.id] });
      qc.invalidateQueries({ queryKey: ["grok-projects", project.profile_id] });
      toast("Đã cập nhật assignment", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
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
              <Globe size={16} className="text-violet-600" /> Assign domains
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Project <code className="font-mono">{project.name}</code> → các tenant
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có domain tenant nào.</p>
          ) : (
            <ul className="space-y-1.5">
              {domains.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={effective.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{d.label}</div>
                      <code className="text-[11px] font-mono text-slate-500">{d.hostname}</code>
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
