import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Globe, Plus, Pencil, Trash2, Shield, ArrowRight } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { PAGE_GROUPS } from "./pageCatalog";

interface RoleLite {
  id: string;
  domain_id: string;
  name: string;
  status: "active" | "disabled";
  user_count: number;
}

interface Domain {
  id: string;
  hostname: string;
  label: string;
  description: string | null;
  status: string;
  allow_landing: boolean;
  allow_register: boolean;
  allow_login: boolean;
  allow_all_pages: boolean;
  allowed_pages: string[];
  brand_name: string | null;
  require_playground_key: boolean;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  maintenance_starts_at?: string | null;
  maintenance_announcement?: string | null;
}

// PAGE_GROUPS is imported from pageCatalog.ts — keeps the menu hierarchy in
// one place so both Domain admin and Role editor share the same definition.

export function AdminDomainsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Domain | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: domains, isLoading } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });

  // Pull every role at once so we can group by domain_id without one
  // request per row. /api/admin/roles already returns user_count, which
  // we surface in the per-domain tooltip.
  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => (await api.get<RoleLite[]>("/api/admin/roles")).data,
  });

  const rolesByDomain = useMemo(() => {
    const map: Record<string, RoleLite[]> = {};
    for (const r of roles ?? []) {
      (map[r.domain_id] ||= []).push(r);
    }
    return map;
  }, [roles]);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/domains/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      toast("Đã xóa domain", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi xóa", "error"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe size={18} /> Domains
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi domain có cấu hình quyền vào trang riêng. Domain <code>*</code> là fallback cho host chưa khai báo.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo domain
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Public flags</th>
                <th className="px-3 py-2">Pages</th>
                <th className="px-3 py-2">Roles</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains?.map((d) => (
                <tr key={d.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{d.hostname}</td>
                  <td className="px-3 py-2 font-medium">{d.label}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <StatusPill status={d.status} />
                      {d.maintenance_mode && (
                        <span
                          className="badge-amber text-[10px] inline-flex w-fit"
                          title={d.maintenance_message || "Đang bảo trì"}
                        >
                          🔧 Maintenance
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    <Flag on={d.allow_landing} label="landing" />
                    <Flag on={d.allow_register} label="register" />
                    <Flag on={d.allow_login} label="login" />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {d.allow_all_pages ? (
                      <span className="text-emerald-700 font-medium">Tất cả</span>
                    ) : (
                      <span className="text-slate-600">
                        {d.allowed_pages.length === 0 ? "—" : `${d.allowed_pages.length} trang`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RolesCell roles={rolesByDomain[d.id] ?? []} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{d.brand_name ?? "—"}</td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(d)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    {d.hostname !== "*" && (
                      <button
                        className="btn-ghost text-rose-600"
                        onClick={() => confirm(`Xóa domain ${d.hostname}?`) && remove.mutate(d.id)}
                      >
                        <Trash2 size={14} className="inline mr-1" /> Xóa
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(domains ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Chưa có domain nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <DomainEditorModal
          domain={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
        on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400 line-through"
      }`}
    >
      {label}
    </span>
  );
}

function DomainEditorModal({
  domain, isCreate, onClose,
}: { domain: Domain | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [hostname, setHostname] = useState(domain?.hostname ?? "");
  const [label, setLabel] = useState(domain?.label ?? "");
  const [description, setDescription] = useState(domain?.description ?? "");
  const [status, setStatus] = useState(domain?.status ?? "active");
  const [allowLanding, setAllowLanding] = useState(domain?.allow_landing ?? true);
  const [allowRegister, setAllowRegister] = useState(domain?.allow_register ?? true);
  const [allowLogin, setAllowLogin] = useState(domain?.allow_login ?? true);
  const [allowAllPages, setAllowAllPages] = useState(domain?.allow_all_pages ?? false);
  const [allowedPages, setAllowedPages] = useState<string[]>(domain?.allowed_pages ?? []);
  const [brandName, setBrandName] = useState(domain?.brand_name ?? "");
  const [requirePlaygroundKey, setRequirePlaygroundKey] = useState(domain?.require_playground_key ?? true);
  const [maintenanceMode, setMaintenanceMode] = useState(domain?.maintenance_mode ?? false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(domain?.maintenance_message ?? "");
  // Scheduled window — admin enters "X phút nữa" which is converted to an
  // ISO timestamp on save. 0 / blank = no schedule (no banner).
  const [scheduleMinutes, setScheduleMinutes] = useState<string>(() => {
    if (!domain?.maintenance_starts_at) return "";
    const startsAt = new Date(domain.maintenance_starts_at).getTime();
    const remaining = Math.round((startsAt - Date.now()) / 60_000);
    return remaining > 0 ? String(remaining) : "";
  });
  const [maintenanceAnnouncement, setMaintenanceAnnouncement] = useState(
    domain?.maintenance_announcement ?? ""
  );

  const togglePage = (path: string) => {
    setAllowedPages((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        label, description: description || null, status,
        allow_landing: allowLanding, allow_register: allowRegister,
        allow_login: allowLogin, allow_all_pages: allowAllPages,
        allowed_pages: allowedPages,
        brand_name: brandName || null,
        require_playground_key: requirePlaygroundKey,
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage || null,
        maintenance_starts_at: (() => {
          const m = parseInt(scheduleMinutes, 10);
          if (!m || m <= 0) return null;
          return new Date(Date.now() + m * 60_000).toISOString();
        })(),
        maintenance_announcement: maintenanceAnnouncement || null,
      };
      if (isCreate) payload.hostname = hostname;
      return isCreate
        ? api.post("/api/admin/domains", payload)
        : api.patch(`/api/admin/domains/${domain!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      toast(isCreate ? "Đã tạo domain" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const isDefault = domain?.hostname === "*";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo domain mới" : `Sửa: ${domain?.hostname}`}
          {isDefault && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              Default fallback
            </span>
          )}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Hostname</label>
            <input
              className="input font-mono"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="khach1.com hoặc *"
              disabled={!isCreate}
            />
            <p className="text-xs text-slate-500 mt-1">
              Không có port, không có protocol. Dùng <code>*</code> cho fallback.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Label</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Khách 1 — Pro plan" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Mô tả</label>
          <input className="input" value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Brand name (override)</label>
            <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)}
              placeholder="VD: Khách AI Studio" />
          </div>
        </div>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">Cổng Playground</h3>
          <Checkbox checked={requirePlaygroundKey} onChange={setRequirePlaygroundKey}>
            <strong>Bắt buộc verify API key</strong> trước khi vào Grok Playground
            <span className="block text-xs text-slate-500">
              Bật: user phải dán hoặc generate key, verify mới được submit job. Tắt: vào thẳng (dùng JWT).
            </span>
          </Checkbox>
        </section>

        {/* Maintenance — per-domain. Lets the team patch one tenant in
            isolation without taking the rest of the platform down. */}
        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            🔧 Maintenance mode
            {maintenanceMode && (
              <span className="badge-amber text-[10px]">ĐANG BẬT</span>
            )}
          </h3>
          <Checkbox checked={maintenanceMode} onChange={setMaintenanceMode}>
            <strong>Bật màn hình bảo trì</strong> cho domain này
            <span className="block text-xs text-slate-500">
              Khi bật: user (không phải admin) vào domain sẽ thấy trang "Đang bảo trì".
              Admin / super_admin vẫn dùng bình thường để fix. Các domain khác không bị ảnh hưởng.
            </span>
          </Checkbox>
          {maintenanceMode && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700">Lời nhắn cho khách (tuỳ chọn)</label>
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  placeholder="VD: Đang nâng cấp tính năng video. Dự kiến xong lúc 22h tối nay."
                  maxLength={2000}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Hiển thị trong khung vàng trên trang bảo trì. Hỗ trợ xuống dòng.
                </p>
              </div>
              {!isCreate && domain?.hostname && domain.hostname !== "*" && (
                <a
                  href={`https://${domain.hostname}/?preview=maintenance`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm w-fit"
                >
                  🔍 Xem trước (mở tab mới)
                </a>
              )}
            </>
          )}

          {/* Scheduled-maintenance window. Independent of the immediate
              toggle — admin can either flip on instantly OR pre-announce
              with a countdown. Both can be used together (toggle stays
              off until elapsed, then auto-activates client-side). */}
          <div className="border-t pt-3 mt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Lên lịch trước (banner đếm ngược)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">
                  Bảo trì sau X phút
                </label>
                <input
                  className="input mt-1"
                  type="number"
                  min={0}
                  max={1440}
                  value={scheduleMinutes}
                  onChange={(e) => setScheduleMinutes(e.target.value)}
                  placeholder="VD: 5"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  0 hoặc rỗng = không lên lịch (không hiện banner).
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">
                  Dòng chữ chạy trên banner
                </label>
                <input
                  className="input mt-1"
                  value={maintenanceAnnouncement}
                  onChange={(e) => setMaintenanceAnnouncement(e.target.value)}
                  placeholder="VD: Vui lòng dừng các thao tác trước 22h00"
                  maxLength={2000}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Hiện trên top mỗi trang, chạy ngang (marquee).
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">Trang public</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <Checkbox checked={allowLanding} onChange={setAllowLanding}>
              Cho phép vào <code>/landing</code> (trang chủ)
            </Checkbox>
            <Checkbox checked={allowRegister} onChange={setAllowRegister}>
              Cho phép <code>/register</code> (signup)
            </Checkbox>
            <Checkbox checked={allowLogin} onChange={setAllowLogin}>
              Cho phép <code>/login</code>
            </Checkbox>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Trang authed (sau khi login)</h3>
            <Checkbox checked={allowAllPages} onChange={setAllowAllPages}>
              <strong>Full quyền</strong> tất cả trang
            </Checkbox>
          </div>
          {!allowAllPages && (
            <div className="space-y-3">
              {PAGE_GROUPS.map((group) => {
                const groupPaths = group.items.map((i) => i.path);
                const allOn = groupPaths.every((p) => allowedPages.includes(p));
                const someOn = !allOn && groupPaths.some((p) => allowedPages.includes(p));
                const toggleGroup = () => {
                  setAllowedPages((prev) =>
                    allOn
                      ? prev.filter((p) => !groupPaths.includes(p))
                      : Array.from(new Set([...prev, ...groupPaths])),
                  );
                };
                return (
                  <div key={group.key} className="border rounded-md p-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn; }}
                        onChange={toggleGroup}
                      />
                      <span className="font-semibold text-sm">{group.label}</span>
                      <span className="text-xs text-slate-500">
                        {allOn ? "(toàn nhóm)" : someOn ? `(${groupPaths.filter((p) => allowedPages.includes(p)).length}/${groupPaths.length})` : ""}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 pl-5 text-sm">
                      {group.items.map((p) => (
                        <Checkbox
                          key={p.path}
                          checked={allowedPages.includes(p.path)}
                          onChange={() => togglePage(p.path)}
                        >
                          <span className="font-medium">{p.label}</span>
                          <span className="text-xs text-slate-500 block">{p.path}</span>
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Admin luôn có quyền vào mọi trang, không bị giới hạn bởi cấu hình này.
          </p>
        </section>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !hostname || !label}
            className="btn-primary"
          >
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  checked, onChange, children,
}: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  );
}

/** Per-domain roles summary on the Domains list. Shows count + the first
 *  few role names as chips, with total user-count and a link to manage
 *  them. Empty state nudges admins to create one — roles are the standard
 *  way to scope a domain's user menu. */
function RolesCell({ roles }: { roles: RoleLite[] }) {
  if (roles.length === 0) {
    return (
      <Link
        to="/admin/roles"
        className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
      >
        <Plus size={12} /> Tạo role
      </Link>
    );
  }
  const totalUsers = roles.reduce((sum, r) => sum + r.user_count, 0);
  const tooltip = roles
    .map((r) => `• ${r.name}${r.status === "disabled" ? " (disabled)" : ""} — ${r.user_count} user`)
    .join("\n");
  const preview = roles.slice(0, 2);
  return (
    <div className="text-xs" title={tooltip}>
      <Link
        to="/admin/roles"
        className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-violet-600"
      >
        <Shield size={11} /> {roles.length} role · {totalUsers} user
        <ArrowRight size={11} className="opacity-60" />
      </Link>
      <div className="mt-1 flex flex-wrap gap-1">
        {preview.map((r) => (
          <span
            key={r.id}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              r.status === "active"
                ? "bg-violet-50 text-violet-700"
                : "bg-slate-100 text-slate-500 line-through"
            }`}
          >
            {r.name}
          </span>
        ))}
        {roles.length > preview.length && (
          <span className="text-[10px] text-slate-400 self-center">
            +{roles.length - preview.length}
          </span>
        )}
      </div>
    </div>
  );
}
