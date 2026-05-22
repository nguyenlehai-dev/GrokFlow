import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Copy, Check, X, Wand2 } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import type { Plan } from "../models/plan";
import type { DomainOpt } from "../models/user";
import { usersService, type QuickProvisionIn, type QuickProvisionOut } from "../services/users.service";
import { domainsService } from "../services/domains.service";
import { toolInstallsService, type ToolInstallAdmin } from "../services/toolInstalls.service";

/** Single-step customer onboard.
 *
 *  Combines what would be 3-5 separate admin screens (Domain → Plan →
 *  User → API Key → copy credentials) into one form + one result screen.
 *  Returns the API key in plaintext exactly once — the result panel has
 *  a copy-all button that bundles login URL + email + password + key
 *  into a single text block ready to paste into a chat with the customer.
 */
export function QuickProvisionModal({
  plans,
  onClose,
}: {
  plans: Plan[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";

  const [scopeMode, setScopeMode] = useState<"existing" | "new" | "tool" | "none">("existing");
  const [pinAsOnly, setPinAsOnly] = useState(true);
  const [includeApiKey, setIncludeApiKey] = useState(true);
  const [result, setResult] = useState<QuickProvisionOut | null>(null);
  const [copied, setCopied] = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{
    email: string;
    password: string;
    full_name: string;
    role: "user" | "admin" | "support";
    plan_id: string;
    domain_id: string;
    new_hostname: string;
    new_quota: string;
    tool_install_id: string;
    api_key_name: string;
    api_key_daily_limit: string;
  }>({
    defaultValues: {
      role: "user",
      plan_id: plans.find((p) => p.is_default)?.id ?? "",
      api_key_name: "default",
      api_key_daily_limit: "1000",
    },
  });

  const { data: domains } = useQuery<DomainOpt[]>({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<DomainOpt>(),
    enabled: isSuper && scopeMode === "existing",
  });

  const { data: toolInstalls } = useQuery<ToolInstallAdmin[]>({
    queryKey: ["admin-tool-installs", "for-quick-provision"],
    queryFn: () => toolInstallsService.list({ limit: 200 }),
    enabled: isSuper && scopeMode === "tool",
  });

  const provision = useMutation({
    mutationFn: (payload: QuickProvisionIn) => usersService.quickProvision(payload),
    onSuccess: (out) => {
      setResult(out);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast("Đã cấp tài khoản — copy credentials gửi cho khách", "success");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message
        ?? e?.response?.data?.detail
        ?? "Cấp tài khoản lỗi";
      toast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    },
  });

  const onSubmit = handleSubmit((v) => {
    const payload: QuickProvisionIn = {
      email: v.email,
      password: v.password,
      full_name: v.full_name,
      role: v.role,
      plan_id: v.plan_id || null,
      create_api_key: includeApiKey,
      api_key_name: v.api_key_name,
      api_key_daily_limit: Number(v.api_key_daily_limit) || 1000,
    };
    if (scopeMode === "existing") {
      payload.domain_id = v.domain_id || null;
    } else if (scopeMode === "new") {
      payload.new_domain = {
        hostname: v.new_hostname,
        jobs_quota_per_day: v.new_quota ? Number(v.new_quota) : null,
      };
    } else if (scopeMode === "tool") {
      payload.tool_install_id = v.tool_install_id || null;
      payload.pin_as_only_user = pinAsOnly;
    }
    provision.mutate(payload);
  });

  const passwordValueRef = (document.getElementById("qp-password") as HTMLInputElement | null)?.value;

  const credentialsText = result
    ? [
        `🔑 Tài khoản GrokFlow`,
        `──────────────────`,
        result.tool_install_id
          ? `Truy cập: Mở app GrokFlow Desktop trên máy đã đăng ký`
          : `Login: ${result.login_url}`,
        result.tool_install_label ? `Tool install: ${result.tool_install_label}` : "",
        `Email: ${result.user_email}`,
        passwordValueRef ? `Password: ${passwordValueRef}` : "",
        result.api_key ? `\nAPI Key: ${result.api_key}` : "",
        result.api_key ? `(Lưu ngay — không hiện lại)` : "",
      ].filter(Boolean).join("\n")
    : "";

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(credentialsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Trình duyệt chặn clipboard — copy thủ công", "error");
    }
  };

  // Result screen (post-provision)
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
        <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-emerald-700 flex items-center gap-2">
              <Check size={20} /> Đã cấp tài khoản
            </h2>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {result.tool_install_id ? (
              <Row label="Truy cập">
                <span className="text-slate-700">Mở app GrokFlow Desktop trên máy đã đăng ký tool install</span>
              </Row>
            ) : (
              <Row label="Login URL"><a href={result.login_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{result.login_url}</a></Row>
            )}
            <Row label="Email"><code className="font-mono">{result.user_email}</code></Row>
            {result.domain_hostname && <Row label="Domain"><code className="font-mono">{result.domain_hostname}</code></Row>}
            {result.tool_install_label && <Row label="Tool install"><code className="font-mono">{result.tool_install_label}</code></Row>}
            {result.api_key && (
              <Row label="API Key">
                <code className="font-mono text-xs break-all bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  {result.api_key}
                </code>
              </Row>
            )}
          </div>

          {result.api_key && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠ API key chỉ hiển thị 1 lần. Copy ngay bằng nút bên dưới.
            </p>
          )}

          <p className="text-xs text-slate-500">{result.note}</p>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={copyAll}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Đã copy" : "Copy tất cả credentials"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form screen
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4 animate-fade-in">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-card-hover space-y-3 max-h-[95vh] overflow-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wand2 size={18} className="text-indigo-600" />
            Cấp tài khoản nhanh (Quick Provision)
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Gộp Domain + User + API Key thành 1 bước. Sau submit, credentials hiện ra để bạn copy gửi khách.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input className="input" type="email" {...register("email", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Password tạm</label>
            <input id="qp-password" className="input" type="text" {...register("password", { required: true, minLength: 8 })} placeholder="≥ 8 ký tự" />
          </div>
          <div>
            <label className="text-sm font-medium">Họ tên</label>
            <input className="input" {...register("full_name", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <select className="input" {...register("role")}>
              <option value="user">user</option>
              {isSuper && <option value="admin">admin</option>}
              <option value="support">support</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Plan</label>
            <select className="input" {...register("plan_id")}>
              <option value="">— không gán plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.code} {p.is_default ? "(default)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3 space-y-2">
          <legend className="text-sm font-medium px-1">Scope (Domain hoặc Tool Install)</legend>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scopeMode === "existing"} onChange={() => setScopeMode("existing")} disabled={!isSuper} />
              Domain có sẵn
            </label>
            {isSuper && (
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scopeMode === "new"} onChange={() => setScopeMode("new")} />
                Tạo domain mới
              </label>
            )}
            {isSuper && (
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scopeMode === "tool"} onChange={() => setScopeMode("tool")} />
                Gán Tool Install (kiosk)
              </label>
            )}
            {isSuper && (
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scopeMode === "none"} onChange={() => setScopeMode("none")} />
                Không gán
              </label>
            )}
          </div>
          {scopeMode === "existing" && (
            <select className="input" {...register("domain_id")}>
              <option value="">— pick domain —</option>
              {(domains ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          )}
          {scopeMode === "new" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="hostname (vd: khach.nexoratech.com.vn)" {...register("new_hostname", { required: scopeMode === "new" })} />
              <input className="input" type="number" placeholder="quota/ngày (trống = unlimited)" {...register("new_quota")} />
            </div>
          )}
          {scopeMode === "tool" && (
            <>
              <select className="input" {...register("tool_install_id", { required: scopeMode === "tool" })}>
                <option value="">— pick tool install —</option>
                {(toolInstalls ?? []).map((ti) => (
                  <option key={ti.id} value={ti.id}>
                    {ti.label || ti.tool_id}
                    {ti.machine_name ? ` · ${ti.machine_name}` : ""}
                    {ti.assigned_user_email ? ` (đã có ${ti.assigned_user_email})` : ""}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={pinAsOnly} onChange={(e) => setPinAsOnly(e.target.checked)} />
                Pin khách này làm "chủ" install — máy này về sau không login user khác được
              </label>
              <p className="text-[11px] text-slate-500">
                Khách tool-bound chỉ login được từ desktop app đã cài trên máy đăng ký install này. Không có URL web để truy cập.
              </p>
            </>
          )}
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3 space-y-2">
          <legend className="text-sm font-medium px-1 flex items-center gap-2">
            <input type="checkbox" checked={includeApiKey} onChange={(e) => setIncludeApiKey(e.target.checked)} />
            Cấp kèm API Key (cho khách tích hợp app)
          </legend>
          {includeApiKey && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Tên key</label>
                <input className="input" {...register("api_key_name")} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Daily limit</label>
                <input className="input" type="number" {...register("api_key_daily_limit")} />
              </div>
            </div>
          )}
        </fieldset>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button type="button" onClick={onClose} className="btn-secondary">Huỷ</button>
          <button type="submit" disabled={isSubmitting || provision.isPending} className="btn-primary">
            {provision.isPending ? "Đang cấp..." : "Cấp tài khoản"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs uppercase tracking-wide text-slate-500 w-24 shrink-0">{label}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}
