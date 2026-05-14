import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Key, Plus, Search, Globe, Mail, Trash2, Ban, Copy, X, CheckCircle2,
  BookOpen, Terminal, Lock, Zap, AlertTriangle,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  allowed_providers: string[];
  allowed_job_types: string[];
  rate_limit_per_minute: number;
  daily_limit: number;
  used_today: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  // Enriched (admin/super_admin viewer)
  user_id: string;
  user_email: string | null;
  domain_id: string | null;
  domain_hostname: string | null;
}

interface Domain {
  id: string;
  hostname: string;
  label: string;
}

interface CreateValues {
  name: string;
  providers: { grok: boolean; flow: boolean };
  jobTypes: { image: boolean; video: boolean };
  daily_limit: number;
  rate_limit_per_minute: number;
}

const STATUS_OPTIONS = [
  { v: "", label: "Tất cả" },
  { v: "active", label: "Active" },
  { v: "revoked", label: "Revoked" },
];

export function ApiKeysPage() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const isAdmin = me?.role === "admin" || isSuper;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [created, setCreated] = useState<{ name: string; api_key: string } | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys", domainFilter, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (domainFilter) params.domain_id = domainFilter;
      return (await api.get<ApiKey[]>("/api/api-keys", { params })).data;
    },
  });

  // super_admin gets a domain dropdown; tenant admins see only their domain
  // implicitly via the backend filter.
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
    enabled: isSuper,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.patch(`/api/api-keys/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast("Đã thu hồi key", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast("Đã xóa key", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  // Client-side search across name, prefix, email, domain.
  const filtered = useMemo(() => {
    const items = keys ?? [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.key_prefix.toLowerCase().includes(q) ||
        (k.user_email ?? "").toLowerCase().includes(q) ||
        (k.domain_hostname ?? "").toLowerCase().includes(q),
    );
  }, [keys, search]);

  // Group by domain for super_admin — gives a "phân loại theo doman" view.
  // Tenant admins skip grouping; their list is already one-domain-only.
  const groupedByDomain = useMemo(() => {
    if (!isSuper) return null;
    const map = new Map<string, { hostname: string; items: ApiKey[] }>();
    for (const k of filtered) {
      const key = k.domain_hostname ?? "(no domain)";
      if (!map.has(key)) map.set(key, { hostname: key, items: [] });
      map.get(key)!.items.push(k);
    }
    return Array.from(map.values()).sort((a, b) => a.hostname.localeCompare(b.hostname));
  }, [filtered, isSuper]);

  const stats = useMemo(() => {
    const all = keys ?? [];
    return {
      total: all.length,
      active: all.filter((k) => k.status === "active").length,
      revoked: all.filter((k) => k.status === "revoked").length,
      used_today: all.reduce((s, k) => s + k.used_today, 0),
    };
  }, [keys]);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 shadow">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">API Keys</p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Key size={22} />
              {isSuper ? "Quản lý toàn bộ keys" : "Quản lý API keys"}
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {isSuper
                ? "Mọi key trên hệ thống — phân loại theo domain + chủ sở hữu."
                : isAdmin
                ? "Keys của user trong domain bạn quản lý."
                : "Keys của tài khoản bạn."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelp(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900/10 hover:bg-ink-900/20 backdrop-blur-sm px-3 py-2 text-sm font-medium border border-white/30"
              title="Xem hướng dẫn dùng API key"
            >
              <BookOpen size={14} /> Hướng dẫn
            </button>
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900/15 hover:bg-ink-900/25 backdrop-blur-sm px-4 py-2 text-sm font-medium"
            >
              <Plus size={16} /> Tạo API Key
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
          <Stat label="Tổng key" value={stats.total} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Revoked" value={stats.revoked} />
          <Stat label="Dùng hôm nay" value={stats.used_today} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg bg-ink-900 p-3 ring-1 ring-ink-800 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-ink-300">Tìm key</label>
          <div className="mt-1 flex items-center rounded-md border border-ink-700 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search size={14} className="text-ink-500" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder="Tên, prefix, email user, domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-300">Status</label>
          <select
            className="input mt-1 w-32 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        {isSuper && (
          <div className="min-w-[200px]">
            <label className="text-xs font-medium text-ink-300">Domain</label>
            <select
              className="input mt-1 w-full text-sm"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
            >
              <option value="">— Tất cả domain —</option>
              {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          </div>
        )}
        <div className="text-xs text-ink-400">
          {filtered.length} / {keys?.length ?? 0} key
        </div>
      </div>

      {/* Table — grouped when super_admin */}
      {isLoading ? (
        <p className="text-ink-400">Đang tải...</p>
      ) : isSuper && groupedByDomain ? (
        <div className="space-y-4">
          {groupedByDomain.length === 0 ? (
            <EmptyState />
          ) : (
            groupedByDomain.map((g) => (
              <DomainGroup
                key={g.hostname}
                hostname={g.hostname}
                items={g.items}
                onRevoke={(id) => revoke.mutate(id)}
                onDelete={(id, name) => confirm(`Xóa hẳn key "${name}"?`) && remove.mutate(id)}
              />
            ))
          )}
        </div>
      ) : (
        <KeysTable
          items={filtered}
          showOwner={isAdmin}
          onRevoke={(id) => revoke.mutate(id)}
          onDelete={(id, name) => confirm(`Xóa hẳn key "${name}"?`) && remove.mutate(id)}
        />
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
      {open && <CreateModal onClose={() => setOpen(false)} onCreated={(c) => { setCreated(c); setOpen(false); }} />}
      {created && <CreatedModal value={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-ink-900/15 backdrop-blur-sm px-3 py-2">
      <p className="opacity-80">{label}</p>
      <p className="font-bold text-lg leading-tight">{value.toLocaleString()}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border-2 border-dashed border-ink-800 bg-ink-900 py-12 text-center text-sm text-ink-400">
      <Key size={32} className="mx-auto text-ink-500" />
      <p className="mt-2">Không có key nào khớp filter.</p>
    </div>
  );
}

function DomainGroup({
  hostname, items, onRevoke, onDelete,
}: {
  hostname: string;
  items: ApiKey[];
  onRevoke: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const active = items.filter((k) => k.status === "active").length;
  return (
    <div className="rounded-lg ring-1 ring-ink-800 bg-ink-900 overflow-hidden">
      <div className="px-4 py-2.5 bg-ink-900 border-b border-ink-800 flex items-center gap-2">
        <Globe size={14} className="text-violet-600" />
        <span className="font-mono text-sm font-semibold text-ink-100">{hostname}</span>
        <span className="text-xs text-ink-400">
          {items.length} key · {active} active
        </span>
      </div>
      <KeysTable items={items} showOwner showDomain={false} onRevoke={onRevoke} onDelete={onDelete} embedded />
    </div>
  );
}

function KeysTable({
  items, showOwner, showDomain = true, onRevoke, onDelete, embedded = false,
}: {
  items: ApiKey[];
  showOwner: boolean;
  showDomain?: boolean;
  onRevoke: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "overflow-x-auto" : "rounded-lg ring-1 ring-ink-800 bg-ink-900 overflow-x-auto"}>
      <table className="w-full text-sm">
        <thead className="bg-ink-900 text-left">
          <tr>
            <th className="px-4 py-2">Name / Prefix</th>
            {showOwner && <th className="px-4 py-2">Owner</th>}
            {showDomain && <th className="px-4 py-2">Domain</th>}
            <th className="px-4 py-2">Scope</th>
            <th className="px-4 py-2">Usage</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-400">
                Chưa có API key nào.
              </td>
            </tr>
          )}
          {items.map((k) => {
            const usagePct = k.daily_limit > 0 ? (k.used_today / k.daily_limit) * 100 : 0;
            return (
              <tr key={k.id} className="border-t border-ink-800 hover:bg-ink-900 align-top">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink-100">{k.name}</div>
                  <code className="text-[11px] font-mono text-ink-400">{k.key_prefix}…</code>
                </td>
                {showOwner && (
                  <td className="px-4 py-2.5 text-xs">
                    <div className="inline-flex items-center gap-1 text-ink-200">
                      <Mail size={11} className="text-ink-500" />
                      {k.user_email ?? <span className="italic text-ink-500">(deleted)</span>}
                    </div>
                  </td>
                )}
                {showDomain && (
                  <td className="px-4 py-2.5 text-xs">
                    {k.domain_hostname ? (
                      <span className="inline-flex items-center gap-1 font-mono text-ink-200">
                        <Globe size={11} className="text-ink-500" />
                        {k.domain_hostname}
                      </span>
                    ) : (
                      <span className="italic text-ink-500">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(k.allowed_providers ?? []).map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-mono text-[10px]">
                        {p}
                      </span>
                    ))}
                    {(k.allowed_job_types ?? []).map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 font-mono text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <div className="font-mono text-ink-200">
                    {k.used_today}/{k.daily_limit}
                  </div>
                  <div className="mt-0.5 h-1 w-20 rounded-full bg-ink-700 overflow-hidden">
                    <div
                      className={`h-full ${
                        usagePct >= 90 ? "bg-rose-500"
                          : usagePct >= 70 ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, usagePct)}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={k.status} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1">
                  {k.status === "active" && (
                    <button
                      onClick={() => onRevoke(k.id)}
                      className="btn-ghost text-amber-700"
                      title="Thu hồi (giữ row để audit)"
                    >
                      <Ban size={13} className="inline mr-1" /> Revoke
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(k.id, k.name)}
                    className="btn-ghost text-rose-600"
                    title="Xóa hẳn"
                  >
                    <Trash2 size={13} className="inline mr-1" /> Xóa
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (v: { name: string; api_key: string }) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: {
      providers: { grok: true, flow: false },
      jobTypes: { image: true, video: true },
      daily_limit: 1000,
      rate_limit_per_minute: 60,
    },
  });

  const onSubmit = async (v: CreateValues) => {
    const allowed_providers = Object.entries(v.providers).filter(([, on]) => on).map(([k]) => k);
    const allowed_job_types = Object.entries(v.jobTypes).filter(([, on]) => on).map(([k]) => k);
    const { data } = await api.post("/api/api-keys", {
      name: v.name,
      allowed_providers,
      allowed_job_types,
      daily_limit: Number(v.daily_limit),
      rate_limit_per_minute: Number(v.rate_limit_per_minute),
    });
    qc.invalidateQueries({ queryKey: ["api-keys"] });
    onCreated({ name: data.name, api_key: data.api_key });
  };

  return (
    <Modal title="Tạo API Key mới" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} placeholder="VD: Studio Key, Production Key" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Providers</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.grok")} /> grok</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.flow")} /> flow</label>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Job types</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.image")} /> image</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.video")} /> video</label>
          </fieldset>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Daily limit</label>
            <input className="input" type="number" min={1} {...register("daily_limit", { required: true, min: 1 })} />
          </div>
          <div>
            <label className="text-sm font-medium">Rate / phút</label>
            <input className="input" type="number" min={1} {...register("rate_limit_per_minute", { required: true, min: 1 })} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button className="btn-primary" disabled={isSubmitting}>Tạo key</button>
        </div>
      </form>
    </Modal>
  );
}

function CreatedModal({ value, onClose }: { value: { name: string; api_key: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Modal title="Copy ngay — key chỉ hiển thị 1 lần" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-300">
          Key cho <strong>{value.name}</strong>. Sau khi đóng dialog, key này không xem lại được nữa.
        </p>
        <pre className="rounded-md bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre-wrap break-all">
          {value.api_key}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {copied ? <><CheckCircle2 size={14} /> Đã copy</> : <><Copy size={14} /> Copy</>}
          </button>
          <button className="btn-ghost" onClick={onClose}>Tôi đã lưu</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, maxWidth = "max-w-lg" }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className={`w-full ${maxWidth} max-h-[92vh] rounded-lg bg-ink-900 shadow-xl flex flex-col`}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-300"><X size={18} /></button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── Help modal ────────────────────────────────────────────────────────────

const CURL_EXAMPLES = {
  verify: `curl -X POST https://YOUR-DOMAIN/api/api-keys/verify \\
  -H 'Content-Type: application/json' \\
  -d '{"key":"uxpm_live_..."}'`,
  submitJob: `curl -X POST https://YOUR-DOMAIN/api/jobs \\
  -H 'Authorization: Bearer uxpm_live_...' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "provider": "grok",
    "job_type": "image",
    "prompt": "A dragon flying over Ha Long Bay, watercolor",
    "options": { "aspect": "16:9", "size": "1024x576", "n": 1, "quality": "speed" }
  }'`,
  pollStatus: `curl https://YOUR-DOMAIN/api/jobs/<JOB_ID> \\
  -H 'Authorization: Bearer uxpm_live_...'`,
};

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Hướng dẫn dùng API Key" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5 text-sm">
        {/* Intro */}
        <section className="rounded-md bg-violet-50 border border-violet-200 p-3 text-violet-900 text-xs leading-relaxed">
          API Key là chuỗi <code className="font-mono px-1 rounded bg-violet-100">uxpm_live_...</code>{" "}
          dùng để gọi GrokFlow API từ bên ngoài (CLI, server, ứng dụng khác).
          Key được tạo trong dashboard này và chỉ <strong>hiển thị một lần</strong>.
          Hãy copy + lưu vào nơi an toàn (1Password, .env, vault).
        </section>

        {/* Step 1 */}
        <Step n={1} icon={Key} title="Tạo key">
          Bấm <strong>+ Tạo API Key</strong> ở góc trên, đặt tên (vd <em>Production
          Server</em>), chọn provider (`grok` / `flow`) + job types (`image` /
          `video`) + daily limit (mặc định 1000 calls/ngày). Sau khi tạo,
          modal hiển thị key đầy đủ — copy ngay.
        </Step>

        {/* Step 2 */}
        <Step n={2} icon={Lock} title="Verify key (tuỳ chọn)">
          Test xem key có valid không. Endpoint <code className="font-mono">/api/api-keys/verify</code> không cần auth
          — trả về metadata của key nếu valid:
          <CodeBlock code={CURL_EXAMPLES.verify} />
        </Step>

        {/* Step 3 */}
        <Step n={3} icon={Zap} title="Submit job">
          Gắn key vào header{" "}
          <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>.
          Job sẽ chạy <strong>dưới account chủ sở hữu key</strong>, không phụ thuộc JWT của browser:
          <CodeBlock code={CURL_EXAMPLES.submitJob} />
          <p className="text-xs text-ink-400 mt-2">
            Response trả về <code>job_id</code> + <code>status</code> = <code>queued</code>.
          </p>
        </Step>

        {/* Step 4 */}
        <Step n={4} icon={Terminal} title="Poll status / lấy kết quả">
          Job xử lý async — bạn poll cho tới khi <code>status=success</code>:
          <CodeBlock code={CURL_EXAMPLES.pollStatus} />
          <p className="text-xs text-ink-400 mt-2">
            Khi xong, <code>result_url</code> sẽ trỏ tới{" "}
            <code className="font-mono">/api/files/&lt;file-id&gt;/download</code>.
            Dùng cùng Bearer key để tải file.
          </p>
        </Step>

        {/* Limits */}
        <Step n={5} icon={AlertTriangle} title="Giới hạn + best practice">
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Daily limit</strong> reset lúc <code>00:00 Asia/Ho_Chi_Minh</code>. Vượt → backend trả <code>429 Too Many Requests</code>.</li>
            <li><strong>Rate limit</strong> mặc định 60 req/phút — chỉnh được khi tạo key.</li>
            <li>Key bị <strong>Revoke</strong> sẽ stop nhận request ngay lập tức (status code 401).</li>
            <li>Không commit key vào git. Dùng env var hoặc secret manager.</li>
            <li>Mỗi môi trường (dev / prod) tạo 1 key riêng — Revoke độc lập khi bị lộ.</li>
          </ul>
        </Step>

        {/* Playground tip */}
        <section className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-900 text-xs">
          💡 <strong>Test nhanh không cần curl</strong>: vào{" "}
          <a href="/grok/playground" className="underline font-medium">/grok/playground</a>{" "}
          → bấm <em>Open System Auth</em> → paste key → Verify → submit job từ UI.
          Đây là cùng đường mà external client của bạn sẽ đi.
        </section>

        <div className="flex justify-end pt-2 border-t">
          <button onClick={onClose} className="btn-primary">Đã hiểu</button>
        </div>
      </div>
    </Modal>
  );
}

function Step({
  n, icon: Icon, title, children,
}: {
  n: number;
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold text-ink-100 mb-1.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold">
          {n}
        </span>
        <Icon size={14} className="text-ink-400" />
        {title}
      </h3>
      <div className="pl-8 text-ink-300 leading-relaxed text-xs">{children}</div>
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative mt-1">
      <pre className="rounded-md bg-slate-900 text-slate-100 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100"
      >
        {copied ? <><CheckCircle2 size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
      </button>
    </div>
  );
}
