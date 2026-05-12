import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

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
}

// All known frontend routes. Keep in sync with router.tsx.
// Granular sub-pages first so admin can grant just one Gateway tab without
// the rest; the parent path (eg "/gateway") still matches all if used.
const ALL_PAGES = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/api-keys", label: "API Keys" },
  // Grok management
  { path: "/profiles", label: "Profiles" },
  { path: "/jobs", label: "Jobs" },
  { path: "/api-docs", label: "API Docs (Grok)" },
  // Flow tools
  { path: "/flow", label: "Flow (toàn nhóm)" },
  // Gateway sub-pages. Items marked (admin) require the user's role to be
  // admin — granting the domain alone won't make these visible to a regular
  // user. Use them only when you plan to log in as admin from this domain.
  { path: "/gateway", label: "Gateway (toàn nhóm)" },
  { path: "/gateway/dashboard", label: "Gateway · Dashboard (admin)" },
  { path: "/gateway/vendors", label: "Gateway · Vendors (admin)" },
  { path: "/gateway/pools", label: "Gateway · Pools (admin)" },
  { path: "/gateway/functions", label: "Gateway · API Functions (admin)" },
  { path: "/gateway/gateway-keys", label: "Gateway · Gateway Keys (admin)" },
  { path: "/gateway/requests", label: "Gateway · Requests (admin)" },
  { path: "/gateway/playground", label: "Gateway · Playground" },
  { path: "/gateway/docs", label: "Gateway · API Docs" },
  // Billing / settings
  { path: "/billing", label: "Billing (user)" },
  { path: "/pricing", label: "Pricing" },
  { path: "/checkout", label: "Checkout" },
  { path: "/audit-logs", label: "Audit Log" },
  { path: "/settings", label: "Settings" },
];

export function AdminDomainsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Domain | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: domains, isLoading } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });

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
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Public flags</th>
                <th className="px-3 py-2">Pages</th>
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
                    <StatusPill status={d.status} />
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
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-sm">
              {ALL_PAGES.map((p) => (
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
