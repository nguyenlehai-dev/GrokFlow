import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { AdminGuard } from "./AdminGuard";
import { PAGE_GROUPS } from "./pageCatalog";
import { toast } from "@/components/ui/Toast";

interface Role {
  id: string;
  domain_id: string;
  name: string;
  description: string | null;
  allowed_pages: string[];
  status: "active" | "disabled";
}

interface Domain {
  id: string;
  hostname: string;
  label: string;
  allow_all_pages: boolean;
  allowed_pages: string[];
}

export function AdminRolesPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const qc = useQueryClient();
  const [filterDomain, setFilterDomain] = useState<string>("");
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
    // Domain admin can't read /api/admin/domains (super_admin only) — fall
    // back to a single-entry list derived from /me so the UI still works.
    enabled: isSuper,
  });

  const fallbackDomain: Domain | null = useMemo(() => {
    if (isSuper || !me?.domain_id) return null;
    return {
      id: me.domain_id,
      hostname: "(your domain)",
      label: "Domain hiện tại",
      allow_all_pages: false,
      allowed_pages: [],
    };
  }, [isSuper, me?.domain_id]);

  const effectiveDomains = isSuper ? (domains ?? []) : (fallbackDomain ? [fallbackDomain] : []);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["admin-roles", filterDomain],
    queryFn: async () => {
      const q = filterDomain ? `?domain_id=${filterDomain}` : "";
      return (await api.get<Role[]>(`/api/admin/roles${q}`)).data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast("Đã xóa role", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const domainLabel = (id: string) =>
    effectiveDomains.find((d) => d.id === id)?.hostname ?? id.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield size={22} /> Roles
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Tạo role
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Role là tập quyền có tên thuộc một domain. Mỗi role chứa danh sách page con của domain
        và được gán cho user khi tạo tài khoản — user chỉ thấy menu của role đó.
      </p>

      {isSuper && (
        <div className="card">
          <label className="text-sm font-medium">Lọc theo domain</label>
          <select
            className="input mt-1"
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
          >
            <option value="">— Tất cả domain —</option>
            {effectiveDomains.filter((d) => d.hostname !== "*").map((d) => (
              <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Tên</th>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Pages</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(roles ?? []).map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{domainLabel(r.domain_id)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.allowed_pages.length} page
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(r)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa role ${r.name}?`) && remove.mutate(r.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(roles ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Chưa có role nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <RoleEditorModal
          role={editing}
          isCreate={creating}
          domains={effectiveDomains.filter((d) => d.hostname !== "*")}
          defaultDomainId={filterDomain || (isSuper ? "" : me?.domain_id ?? "")}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function RoleEditorModal({
  role, isCreate, domains, defaultDomainId, onClose,
}: {
  role: Role | null;
  isCreate: boolean;
  domains: Domain[];
  defaultDomainId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [domainId, setDomainId] = useState(role?.domain_id ?? defaultDomainId);
  const [pages, setPages] = useState<string[]>(role?.allowed_pages ?? []);
  const [status, setStatus] = useState(role?.status ?? "active");

  // Look up the domain to limit pages to what it allows. If the domain has
  // allow_all_pages we let the user pick anything from PAGE_GROUPS.
  const domain = domains.find((d) => d.id === domainId);
  const domainAllowsAll = domain?.allow_all_pages ?? false;
  const domainAllowedSet = new Set(domain?.allowed_pages ?? []);

  const togglePage = (path: string) => {
    setPages((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name, description: description || null,
        allowed_pages: pages, status,
      };
      if (isCreate) body.domain_id = domainId;
      return isCreate
        ? api.post("/api/admin/roles", body)
        : api.patch(`/api/admin/roles/${role!.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast(isCreate ? "Đã tạo role" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo role mới" : `Sửa role: ${role?.name}`}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Tên role</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="VD: Khách, Manager, Operator" />
          </div>
          <div>
            <label className="text-sm font-medium">Domain</label>
            <select
              className="input"
              value={domainId}
              onChange={(e) => { setDomainId(e.target.value); setPages([]); }}
              disabled={!isCreate}
            >
              <option value="">— Chọn domain —</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
              ))}
            </select>
            {!isCreate && (
              <p className="text-xs text-slate-500 mt-1">
                Domain không đổi được sau khi tạo (role gắn cứng với 1 domain).
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Mô tả</label>
          <input className="input" value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </div>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">Trang được phép truy cập</h3>
          <p className="text-xs text-slate-500">
            Chỉ những trang nằm trong allowlist của domain mới hiển thị bên dưới.
            User được gán role này sẽ thấy đúng các trang đã tick.
          </p>
          {!domainId ? (
            <p className="text-slate-500">Chọn domain trước để xem danh sách trang.</p>
          ) : (
            <div className="space-y-3">
              {PAGE_GROUPS.map((group) => {
                const visibleItems = group.items.filter(
                  (i) => domainAllowsAll || domainAllowedSet.has(i.path),
                );
                if (visibleItems.length === 0) return null;
                const groupPaths = visibleItems.map((i) => i.path);
                const allOn = groupPaths.every((p) => pages.includes(p));
                const someOn = !allOn && groupPaths.some((p) => pages.includes(p));
                const toggleGroup = () => {
                  setPages((prev) =>
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
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 pl-5 text-sm">
                      {visibleItems.map((p) => (
                        <label
                          key={p.path}
                          className="flex items-start gap-2 border rounded px-3 py-2 cursor-pointer hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={pages.includes(p.path)}
                            onChange={() => togglePage(p.path)}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{p.label}</span>
                            <span className="text-xs text-slate-500 block">{p.path}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name || !domainId}
            className="btn-primary"
          >
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
