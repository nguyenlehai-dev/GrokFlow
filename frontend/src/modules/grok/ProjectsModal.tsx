import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Plus, Pencil, Trash2, Layers, Globe, ExternalLink, Save,
  ChevronDown, ChevronRight, User as UserIcon, Pin, Wand2, Loader2,
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
  const [autoProvision, setAutoProvision] = useState(false);
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
      <div className="w-full max-w-3xl max-h-[92vh] rounded-xl bg-ink-900 shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-5 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <Layers size={18} className="text-violet-600" /> Projects của profile
            </h2>
            <p className="text-xs text-ink-400 mt-0.5">
              <code className="font-mono">{profileName}</code> · Mỗi project = 1 workspace
              riêng trong Grok account, có thể assign cho 1 hoặc nhiều domain.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-300">
              {projects?.length ?? 0} project — bấm + để đăng ký project mới đã tạo trên grok.com
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-3 py-1.5 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 shadow-sm"
                title="Tạo project trên grok.com → copy URL slug → paste vào đây"
              >
                <Plus size={14} /> Thêm project
              </button>
              <button
                onClick={() => setAutoProvision(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 border border-ink-700 text-ink-200 px-3 py-1.5 text-sm font-semibold hover:bg-ink-900"
                title="(Beta) Tự động dùng VNC browser tạo project — đang fragile với Grok UI changes"
              >
                <Wand2 size={14} /> Tự động <span className="text-[9px] font-bold uppercase tracking-wider px-1 rounded bg-amber-100 text-amber-700">Beta</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-ink-400">Đang tải…</p>
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

        <footer className="border-t px-5 py-3 bg-ink-900 text-xs text-ink-400 flex items-center justify-between">
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

      {autoProvision && (
        <AutoProvisionModal
          profileId={profileId}
          profileName={profileName}
          onClose={() => setAutoProvision(false)}
        />
      )}
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
    <li className="rounded-lg ring-1 ring-ink-800 hover:ring-violet-300 bg-ink-900 p-3.5 flex items-start justify-between gap-3 transition">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink-100">{p.name}</span>
          <code className="text-[11px] font-mono text-ink-400 bg-ink-800 px-1.5 py-0.5 rounded">
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
          <p className="text-xs text-ink-400 mt-1 line-clamp-2">{p.description}</p>
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
    <div className="rounded-xl border-2 border-dashed border-ink-800 bg-ink-900/50 py-10 text-center">
      <Layers size={32} className="mx-auto text-ink-500" />
      <p className="mt-3 font-semibold text-ink-100">Profile này chưa có project nào</p>
      <p className="text-xs text-ink-400 mt-1 max-w-md mx-auto">
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

  const { data: currentUsers } = useQuery({
    queryKey: ["grok-project-users", project?.id],
    queryFn: async () =>
      (await api.get<{ project_id: string; user_ids: string[] }>(
        `/api/grok-projects/${project!.id}/users`,
      )).data,
    enabled: isEdit,
  });

  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string> | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string> | null>(null);
  const effectiveDomains = selectedDomainIds ?? new Set(currentAssign?.domain_ids ?? []);
  const effectiveUsers = selectedUserIds ?? new Set(currentUsers?.user_ids ?? []);

  const toggleDomain = (id: string) => {
    const next = new Set(effectiveDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomainIds(next);
  };
  const toggleUser = (id: string) => {
    const next = new Set(effectiveUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUserIds(next);
  };

  const save = useMutation({
    mutationFn: async () => {
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
      // Push both assignment sets in parallel.
      await Promise.all([
        api.put(`/api/grok-projects/${projectId}/domains`, {
          domain_ids: Array.from(effectiveDomains),
        }),
        api.put(`/api/grok-projects/${projectId}/users`, {
          user_ids: Array.from(effectiveUsers),
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["grok-project-domains", project?.id] });
      qc.invalidateQueries({ queryKey: ["grok-project-users", project?.id] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(
        `${isEdit ? "Đã lưu" : "Đã tạo project"} · ${effectiveDomains.size} domain · ${effectiveUsers.size} user pinned`,
        "success",
      );
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] rounded-xl bg-ink-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{isEdit ? `Sửa: ${project!.name}` : "Thêm project"}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-ink-200">
              Grok project slug <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1 font-mono"
              value={grokId}
              onChange={(e) => setGrokId(e.target.value)}
              placeholder="vd: 7c8a-1234-abcd-..."
            />
            {!isEdit && (
              <div className="mt-1.5 rounded-md bg-violet-50 border border-violet-100 p-2 text-[11px] text-violet-900 leading-relaxed">
                <strong>Cách lấy slug:</strong>{" "}
                Vào <a href="https://grok.com" target="_blank" rel="noreferrer" className="underline">grok.com</a> →
                bấm <strong>+ New Project</strong> ở sidebar → khi URL đổi thành
                <code className="font-mono bg-ink-900 px-1 rounded mx-0.5">grok.com/project/abc-123-...</code>
                → copy phần sau <code className="font-mono">/project/</code> → paste vào đây.
              </div>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink-200">
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
            <span className="font-medium text-ink-200">Mô tả (tùy chọn)</span>
            <textarea
              className="input mt-1"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vd: Brand voice + preset cho khách ABC"
            />
          </label>

          {/* Two-level assignment: domain rows can expand to show their
              users, letting super_admin pin specific users to this project
              (overrides the domain-wide rule for those users). */}
          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-ink-100">
                Gán cho domain & tài khoản
              </span>
              <span className="text-xs text-ink-400">
                · 2 cấp: domain (tất cả user) → tài khoản (riêng từng người)
              </span>
            </div>
            {tenantDomains.length === 0 ? (
              <p className="text-xs text-ink-400 italic">
                Chưa có domain tenant — tạo ở /admin/domains trước.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-auto">
                {tenantDomains.map((d) => (
                  <DomainRow
                    key={d.id}
                    domain={d}
                    checked={effectiveDomains.has(d.id)}
                    onToggle={() => toggleDomain(d.id)}
                    selectedUserIds={effectiveUsers}
                    onToggleUser={toggleUser}
                  />
                ))}
              </div>
            )}
            <div className="mt-3 rounded-md bg-ink-900/70 px-3 py-2 text-[11px] text-ink-300 leading-relaxed">
              <strong>Quy tắc auto-pick lúc submit job:</strong><br />
              1. Nếu user có <Pin size={9} className="inline text-violet-600" />{" "}
              pin tới project này → dùng project đó<br />
              2. Else nếu domain của user có gắn project này → dùng<br />
              3. Else không thấy project (worker fallback /imagine)
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-ink-900">
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
              ? `Lưu · ${effectiveDomains.size} domain · ${effectiveUsers.size} user`
              : `Tạo · ${effectiveDomains.size} domain · ${effectiveUsers.size} user`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  status: string;
}

/** Domain row that expands to its users on click. Outer checkbox toggles
 *  the domain-wide assignment; inner checkboxes pin specific users. */
function DomainRow({
  domain, checked, onToggle, selectedUserIds, onToggleUser,
}: {
  domain: Domain;
  checked: boolean;
  onToggle: () => void;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Lazy-load users only when the row is expanded the first time, so
  // unticked domains don't fire N requests on modal open.
  const { data: users, isLoading } = useQuery({
    queryKey: ["domain-users", domain.id],
    queryFn: async () =>
      (await api.get<UserRow[]>(`/api/grok-projects/_users-by-domain/${domain.id}`)).data,
    enabled: open,
  });

  const pinnedInDomain = (users ?? []).filter((u) => selectedUserIds.has(u.id)).length;

  return (
    <div className="rounded-md bg-ink-900 border border-ink-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="text-sm font-medium text-ink-100">{domain.label}</span>
          <code className="text-[11px] font-mono text-ink-400">{domain.hostname}</code>
          {pinnedInDomain > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
              <Pin size={9} /> {pinnedInDomain} user pinned
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-ink-500 hover:text-ink-200"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-ink-800 bg-ink-900/50 px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-ink-400 italic">Đang tải tài khoản…</p>
          ) : (users ?? []).length === 0 ? (
            <p className="text-xs text-ink-400 italic">
              Domain này chưa có user nào.
            </p>
          ) : (
            <ul className="space-y-1">
              {users!.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-ink-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => onToggleUser(u.id)}
                    />
                    <UserIcon size={11} className="text-ink-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-ink-200 flex-1 truncate">{u.email}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
                      {u.role}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-ink-400 mt-1.5 italic">
            Tick user = pin riêng người đó vào project này (ưu tiên hơn domain-wide).
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Auto-provision modal ─────────────────────────────────────────────────

/** Driver script provisions a Grok project automatically:
 *    open Grok in profile's VNC browser → click "New Project" →
 *    fill name → capture slug → save to DB + apply assignments.
 *
 *  Saves the super_admin the manual copy/paste flow. The backend
 *  endpoint connects to the profile's CDP port; profile MUST be
 *  logged_in for this to work. */
function AutoProvisionModal({
  profileId, profileName, onClose,
}: { profileId: string; profileName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });
  const tenantDomains = (domains ?? []).filter((d) => d.hostname !== "*");
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const toggleDomain = (id: string) => {
    const next = new Set(selectedDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomains(next);
  };
  const toggleUser = (id: string) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUsers(next);
  };

  const provision = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Project>("/api/grok-projects/auto-provision", {
        profile_id: profileId,
        name: name.trim(),
        description: description || null,
        domain_ids: Array.from(selectedDomains),
        user_ids: Array.from(selectedUsers),
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(`Đã tự tạo project "${data.name}" · slug ${data.grok_project_id}`, "success");
      onClose();
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      const msg = detail?.message ?? "Auto-provision lỗi";
      // Common case: Grok's UI changed faster than our selectors.
      // Toast the message + hint at manual fallback so user isn't stuck.
      toast(
        msg.length > 200
          ? `${msg.slice(0, 200)}… → thử nút "Thủ công" (Grok UI có thể đã đổi)`
          : `${msg} → dùng nút "Thủ công" nếu cần`,
        "error",
      );
    },
  });

  const disabled = !name.trim() || provision.isPending;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] rounded-xl bg-ink-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Wand2 size={16} className="text-violet-600" /> Auto-provision project
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Profile <code className="font-mono">{profileName}</code> · GrokFlow sẽ tự mở Grok
              trong VNC, tạo project, capture slug.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Pre-flight check note */}
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed">
            <strong>Yêu cầu:</strong> Profile <code className="font-mono">{profileName}</code> phải
            đang <code className="font-mono">logged_in</code> (đã Auto-login).
            Backend sẽ connect CDP vào VNC container, drive grok.com bằng Playwright.
          </div>

          <label className="block text-sm">
            <span className="font-medium text-ink-200">
              Tên project <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd: Khách ABC - Production"
            />
            <p className="text-xs text-ink-400 mt-1">
              Tên này sẽ hiện trên Grok sidebar + trong GrokFlow.
            </p>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-ink-200">Mô tả (tùy chọn)</span>
            <textarea
              className="input mt-1"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lưu nội bộ, không gửi lên Grok"
            />
          </label>

          {/* Assignment picker — reuse the DomainRow component */}
          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-ink-100">
                Gán cho domain & tài khoản (tùy chọn)
              </span>
            </div>
            {tenantDomains.length === 0 ? (
              <p className="text-xs text-ink-400 italic">Chưa có domain tenant.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {tenantDomains.map((d) => (
                  <DomainRow
                    key={d.id}
                    domain={d}
                    checked={selectedDomains.has(d.id)}
                    onToggle={() => toggleDomain(d.id)}
                    selectedUserIds={selectedUsers}
                    onToggleUser={toggleUser}
                  />
                ))}
              </div>
            )}
          </section>

          {provision.isPending && (
            <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-900 inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Đang mở Grok, tạo project, capture slug… (15-30s)
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-ink-900">
          <button onClick={onClose} className="btn-ghost" disabled={provision.isPending}>
            Hủy
          </button>
          <button
            onClick={() => provision.mutate()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
          >
            {provision.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {provision.isPending
              ? "Đang tạo…"
              : `Tạo tự động · ${selectedDomains.size} domain · ${selectedUsers.size} user`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Domain-only quick-assign modal (kept for inline edits) ───────────────

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
      <div className="w-full max-w-md rounded-xl bg-ink-900 shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Globe size={16} className="text-violet-600" /> Assign domains
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Project <code className="font-mono">{project.name}</code> → các tenant
            </p>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-sm text-ink-400">Đang tải…</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-ink-400">Chưa có domain tenant nào.</p>
          ) : (
            <ul className="space-y-1.5">
              {domains.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 rounded-md border border-ink-800 px-3 py-2 cursor-pointer hover:bg-ink-900">
                    <input
                      type="checkbox"
                      checked={effective.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-100">{d.label}</div>
                      <code className="text-[11px] font-mono text-ink-400">{d.hostname}</code>
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
