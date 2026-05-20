import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Loader2, Pencil, Trash2, Monitor, X, CheckCircle2,
  AlertCircle, PauseCircle, UserPlus,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { TOOL_PAGE_GROUPS } from "../configs/pageCatalog";
import {
  toolInstallsService,
  type ProvisionUserIn,
  type ToolInstallAdmin,
  type ToolInstallUpdate,
} from "../services/toolInstalls.service";

interface UserLite {
  id: string;
  email: string;
  tool_install_id?: string | null;
}

interface PlanLite {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

/** Auth → Tool Installs.
 *
 *  Each row = one desktop-app installation that has phoned home. Admin
 *  reviews pending ones (the "yêu cầu mới" queue), assigns a friendly
 *  label, picks which pages the install can see (same mental model as
 *  /admin/domains), optionally pins to a specific user account for kiosk
 *  deployments, and flips status to active. Until status=active, the
 *  desktop client shows a "Đang chờ admin phê duyệt" screen. */
export function AdminToolInstallsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "active" | "disabled">("all");
  const [editing, setEditing] = useState<ToolInstallAdmin | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tool-installs", q, statusFilter],
    queryFn: () => toolInstallsService.list({
      q: q.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    refetchInterval: 15_000, // pick up new pending registrations
  });

  const pendingCount = useMemo(
    () => (data ?? []).filter((d) => d.status === "pending").length,
    [data],
  );

  const removeMut = useMutation({
    mutationFn: (id: string) => toolInstallsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-installs"] });
      toast("Đã xoá tool install", "success");
    },
  });

  const quickApprove = useMutation({
    mutationFn: (id: string) => toolInstallsService.update(id, { status: "active" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-installs"] });
      toast("Đã duyệt — desktop có thể đăng nhập", "success");
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Tool Installs
            {pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full ring-1 ring-amber-200">
                {pendingCount} chờ duyệt
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Mỗi máy cài GrokFlow Desktop tự đăng ký vào đây. Bạn duyệt + phân quyền
            trang được phép xem (giống domain nhưng key bằng tool_id).
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo machine name / tool_id / label..."
            className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-2 py-1 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="active">Đang hoạt động</option>
          <option value="disabled">Bị khoá</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={20} className="animate-spin mx-auto" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Chưa có máy nào đăng ký. Khi khách cài & mở app, máy của họ sẽ tự xuất hiện ở đây.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <tr>
                <th className="text-left font-medium px-3 py-2">Trạng thái</th>
                <th className="text-left font-medium px-3 py-2">Label / Machine</th>
                <th className="text-left font-medium px-3 py-2">Tool ID</th>
                <th className="text-left font-medium px-3 py-2">Public IP</th>
                <th className="text-left font-medium px-3 py-2">Gán user</th>
                <th className="text-left font-medium px-3 py-2">Trang được xem</th>
                <th className="text-right font-medium px-3 py-2">Last seen</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {data!.map((t) => (
                <tr
                  key={t.id}
                  className={`border-t border-slate-100 hover:bg-slate-50/60 ${
                    t.status === "pending" ? "bg-amber-50/40" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate max-w-[200px]">
                          {t.label ?? <span className="italic text-slate-400">Chưa đặt tên</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {t.machine_name ?? "?"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500" title={t.tool_id}>
                    {t.tool_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{t.public_ip ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs max-w-[140px] truncate">
                    {t.assigned_user_email ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.allow_all_pages
                      ? <span className="text-emerald-700">Tất cả</span>
                      : t.allowed_pages.length === 0
                        ? <span className="text-slate-400 italic">Chưa cấp</span>
                        : <span className="text-slate-600">{t.allowed_pages.length} trang</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs whitespace-nowrap">
                    {timeAgo(t.last_seen_at)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.status === "pending" && (
                      <button
                        onClick={() => quickApprove.mutate(t.id)}
                        title="Duyệt nhanh (set active)"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditing(t)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                      title="Sửa"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Xoá install "${t.label ?? t.machine_name ?? t.tool_id}"? Khi khách mở app lần nữa máy sẽ đăng ký lại như mới.`)) {
                          removeMut.mutate(t.id);
                        }
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                      title="Xoá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ToolInstallEditor
          install={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-tool-installs"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}


function StatusBadge({ status }: { status: string }) {
  const map = {
    pending:  { icon: AlertCircle,   cls: "bg-amber-100 text-amber-800 ring-amber-200",       label: "Chờ duyệt" },
    active:   { icon: CheckCircle2,  cls: "bg-emerald-100 text-emerald-800 ring-emerald-200", label: "Hoạt động" },
    disabled: { icon: PauseCircle,   cls: "bg-slate-100 text-slate-600 ring-slate-200",       label: "Bị khoá" },
  } as const;
  const info = map[status as keyof typeof map] ?? map.disabled;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 whitespace-nowrap ${info.cls}`}>
      <Icon size={10} /> {info.label}
    </span>
  );
}


function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}


function ToolInstallEditor({
  install, onClose, onSaved,
}: {
  install: ToolInstallAdmin;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(install.label ?? "");
  const [description, setDescription] = useState(install.description ?? "");
  const [status, setStatus] = useState<"pending" | "active" | "disabled">(install.status);
  const [allowAll, setAllowAll] = useState(install.allow_all_pages);
  const [allowedPages, setAllowedPages] = useState<string[]>(install.allowed_pages);
  const [brandName, setBrandName] = useState(install.brand_name ?? "");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(install.assigned_user_id);
  const [loginTemplate, setLoginTemplate] = useState<"default" | "admin">(
    (install.login_template === "admin" ? "admin" : "default") as "default" | "admin",
  );
  const [allowLanding, setAllowLanding] = useState(install.allow_landing);
  const [allowLogin, setAllowLogin] = useState(install.allow_login);
  const [allowRegister, setAllowRegister] = useState(install.allow_register);
  // Per-machine quota override. Empty string = inherit from domain (NULL).
  // String storage so the input can be cleared; serialized to number-or-null.
  const [jobsQuotaPerDay, setJobsQuotaPerDay] = useState<string>(
    install.jobs_quota_per_day != null ? String(install.jobs_quota_per_day) : "",
  );
  const [quotaResetHourUtc, setQuotaResetHourUtc] = useState<string>(
    String(install.quota_reset_hour_utc ?? 0),
  );

  const qc = useQueryClient();

  // Pull users for the "pin to user" dropdown. We filter client-side to
  // ONLY show tool-scoped users for this install (or no-scope) — domain
  // users are intentionally excluded since they can't log in here anyway.
  const { data: allUsers = [] } = useQuery({
    queryKey: ["admin-users-light"],
    queryFn: () => api.get<UserLite[]>("/api/admin/users").then((r) => r.data),
  });
  const users = useMemo(
    () => allUsers.filter(
      (u) => !u.tool_install_id || u.tool_install_id === install.id,
    ),
    [allUsers, install.id],
  );

  // Plans for the inline-provision form.
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-light"],
    queryFn: () => api.get<PlanLite[]>("/api/admin/plans").then((r) => r.data),
  });

  // Inline provision section — closed by default.
  const [showProvision, setShowProvision] = useState(false);
  const [provEmail, setProvEmail] = useState("");
  const [provPassword, setProvPassword] = useState("");
  const [provFullName, setProvFullName] = useState("");
  const [provPlanId, setProvPlanId] = useState<string | null>(null);
  const [provPin, setProvPin] = useState(true);

  const provisionMut = useMutation({
    mutationFn: () => {
      const payload: ProvisionUserIn = {
        email: provEmail.trim().toLowerCase(),
        password: provPassword,
        full_name: provFullName.trim() || null,
        plan_id: provPlanId,
        pin_as_only_user: provPin,
      };
      return toolInstallsService.provisionUser(install.id, payload);
    },
    onSuccess: (created) => {
      toast(`Đã tạo ${created.email} + gán vào máy này`, "success");
      // Refresh user list so dropdown shows the new user immediately.
      qc.invalidateQueries({ queryKey: ["admin-users-light"] });
      // Auto-select the new user in the pin dropdown.
      setAssignedUserId(created.id);
      // Reset form + close.
      setProvEmail(""); setProvPassword(""); setProvFullName("");
      setProvPlanId(null); setShowProvision(false);
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });
  const canProvision =
    provEmail.includes("@") && provPassword.length >= 8;

  const togglePage = (path: string) => {
    setAllowedPages((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: ToolInstallUpdate = {
        label: label.trim() || null,
        description: description.trim() || null,
        status,
        allow_all_pages: allowAll,
        allowed_pages: allowAll ? [] : allowedPages,
        allow_landing: allowLanding,
        allow_login: allowLogin,
        allow_register: allowRegister,
        login_template: loginTemplate,
        brand_name: brandName.trim() || null,
        assigned_user_id: assignedUserId || null,
        jobs_quota_per_day: jobsQuotaPerDay.trim() === ""
          ? null
          : Math.max(0, Math.floor(Number(jobsQuotaPerDay))),
        quota_reset_hour_utc: Math.min(23, Math.max(0, Math.floor(Number(quotaResetHourUtc) || 0))),
      };
      return toolInstallsService.update(install.id, payload);
    },
    onSuccess: () => {
      toast("Đã lưu", "success");
      onSaved();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto">
        <header className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">
              Sửa install: {install.label ?? install.machine_name ?? install.tool_id.slice(0, 8)}
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              tool_id: {install.tool_id}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded">
            <X size={16} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {/* Read-only machine info */}
          <section className="grid grid-cols-2 gap-3 text-xs">
            <InfoCell label="Machine name"  value={install.machine_name} />
            <InfoCell label="Public IP"     value={install.public_ip} />
            <InfoCell label="Client version" value={install.client_version} />
            <InfoCell label="Đăng ký lần đầu" value={new Date(install.first_seen_at).toLocaleString()} />
          </section>

          {/* Editable: label / desc / brand */}
          <Field label="Label (tên thân thiện)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Khách A — PC văn phòng"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Ghi chú (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Brand name (hiển thị trong app)">
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Để trống = mặc định"
              className={INPUT_CLS}
            />
          </Field>

          {/* Login screen config — what the desktop renders when not logged in. */}
          <Field label="Login template (màn hình khi mở app)">
            <select
              value={loginTemplate}
              onChange={(e) => setLoginTemplate(e.target.value as "default" | "admin")}
              className={INPUT_CLS}
            >
              <option value="default">Default — landing + login công cộng</option>
              <option value="admin">Admin Console — tối giản, vào thẳng login</option>
            </select>
          </Field>

          <Field label="Public-area flags (trang nào hiện khi chưa đăng nhập)">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={allowLanding}
                  onChange={(e) => setAllowLanding(e.target.checked)} />
                Landing page
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={allowLogin}
                  onChange={(e) => setAllowLogin(e.target.checked)} />
                Login
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={allowRegister}
                  onChange={(e) => setAllowRegister(e.target.checked)} />
                Register
              </label>
            </div>
          </Field>

          {/* Status + assigned user */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trạng thái">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={INPUT_CLS}
              >
                <option value="pending">Pending (chờ duyệt)</option>
                <option value="active">Active (cho phép)</option>
                <option value="disabled">Disabled (khoá)</option>
              </select>
            </Field>
            <Field label="Pin vào tài khoản (kiosk mode)">
              <select
                value={assignedUserId ?? ""}
                onChange={(e) => setAssignedUserId(e.target.value || null)}
                className={INPUT_CLS}
              >
                <option value="">— Bất kỳ user nào —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Per-machine quota override — beats the domain quota when set.
              Tool desktop reads this via /api/domain/quota and shows it on
              the topbar pill. NULL = inherit from parent domain. */}
          <Field label="⚡ Quota Grok / ngày (override domain)">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-slate-700">
                  Số job / ngày
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={jobsQuotaPerDay}
                  onChange={(e) => setJobsQuotaPerDay(e.target.value)}
                  placeholder="Để trống = theo quota domain"
                  className={INPUT_CLS}
                />
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                  Số job/ngày máy này được phép submit. Khi set, override quota của
                  domain (vd: domain 500/ngày, máy này 100/ngày → máy này chỉ chạy 100).
                </p>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-700">
                  Giờ reset (UTC, 0-23)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={quotaResetHourUtc}
                  onChange={(e) => setQuotaResetHourUtc(e.target.value)}
                  className={INPUT_CLS}
                />
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                  💡 <strong>0</strong> = 00:00 UTC (= 07:00 sáng VN). Đặt
                  <strong> 17</strong> để reset đúng 00:00 giờ VN.
                </p>
              </div>
            </div>
          </Field>

          {/* Inline create-user-for-this-install. Tool-scoped users only —
              they can NEVER log in from the web. */}
          {!showProvision ? (
            <button
              type="button"
              onClick={() => setShowProvision(true)}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <UserPlus size={14} /> Tạo user mới cho máy này
            </button>
          ) : (
            <section className="border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-2">
              <header className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                  <UserPlus size={14} /> Tạo user mới cho máy này
                </h4>
                <button
                  type="button"
                  onClick={() => setShowProvision(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </header>
              <p className="text-[11px] text-blue-700/80">
                Tài khoản này CHỈ dùng được trên máy này — không login được trên web.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email">
                  <input
                    type="email"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    placeholder="khach@example.com"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Password (≥ 8 ký tự)">
                  <input
                    type="text"
                    value={provPassword}
                    onChange={(e) => setProvPassword(e.target.value)}
                    placeholder="MatKhau123"
                    className={INPUT_CLS + " font-mono"}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Họ tên (optional)">
                  <input
                    value={provFullName}
                    onChange={(e) => setProvFullName(e.target.value)}
                    placeholder="Nguyen Van A"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Plan (optional)">
                  <select
                    value={provPlanId ?? ""}
                    onChange={(e) => setProvPlanId(e.target.value || null)}
                    className={INPUT_CLS}
                  >
                    <option value="">— Default —</option>
                    {plans.filter((p) => p.is_active).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={provPin}
                  onChange={(e) => setProvPin(e.target.checked)}
                />
                Pin máy này CHỈ cho tài khoản mới (kiosk lock — chỉ email này login được)
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowProvision(false)}
                  className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => provisionMut.mutate()}
                  disabled={!canProvision || provisionMut.isPending}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded"
                >
                  {provisionMut.isPending ? "Đang tạo..." : "Tạo + gán"}
                </button>
              </div>
            </section>
          )}

          {/* Page allowlist */}
          <section>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={allowAll}
                onChange={(e) => setAllowAll(e.target.checked)}
              />
              <span className="text-sm font-medium text-slate-700">
                Cho phép xem TẤT CẢ trang (bỏ qua allowlist bên dưới)
              </span>
            </label>
            {!allowAll && (
              <div className="space-y-3 border border-slate-200 rounded-lg p-3 bg-slate-50/50 max-h-[280px] overflow-auto">
                {TOOL_PAGE_GROUPS.map((group) => (
                  <div key={group.key}>
                    <div className="text-xs font-semibold text-slate-600 mb-1">{group.label}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {group.items.map((page) => (
                        <label key={page.path} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={allowedPages.includes(page.path)}
                            onChange={() => togglePage(page.path)}
                          />
                          <span className="truncate">{page.label}</span>
                          <code className="text-[10px] text-slate-400 ml-auto">{page.path}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="flex justify-end gap-2 p-4 border-t border-slate-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
            Hủy
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md"
          >
            {saveMut.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </footer>
      </div>
    </div>
  );
}

const INPUT_CLS =
  "w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-700 break-words">{value || <span className="text-slate-400 italic">—</span>}</div>
    </div>
  );
}

export default AdminToolInstallsPage;
