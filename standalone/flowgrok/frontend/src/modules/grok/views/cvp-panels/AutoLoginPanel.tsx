import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, RefreshCw, Trash2, Power, Search, Shield, CheckCircle2,
  AlertCircle, XCircle, LogIn, Monitor, X, KeyRound, Mail, Eye, EyeOff,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { LogEntry, LogPanel, PanelHeader, nowTs } from "./shared";

// Mirrors backend ProfileOut schema verified via OpenAPI audit. The
// "tool_install_id" we previously added doesn't exist on Profile — that
// FK belongs to User. Profiles are pool resources owned by admin.
interface Profile {
  id: string;
  name: string;
  provider: string;
  status: "logged_in" | "running_job" | "idle" | "logged_out" | "error";
  last_login_check_at: string | null;
  last_used_at: string | null;
  error_message: string | null;
  active_jobs: number;
  max_concurrent_jobs: number;
  active_video_jobs: number;
  max_concurrent_video: number;
  allows_video: boolean;
  created_at: string;
}

/** Grok Auto Login — manage the pool of Grok accounts the tool uses to
 *  generate content. Each row is a `Profile` (= a Chromium session with
 *  cookies for ONE Grok account). Status reflects whether cookies are
 *  still valid + whether a job is currently running. */
export function AutoLoginPanel() {
  const qc = useQueryClient();
  const userRole = useAuthStore((s) => s.user?.role);
  // Profile mutations (POST /api/profiles, DELETE, check-session, start-vnc)
  // are admin-only on the backend. Hide the corresponding buttons for
  // tool-scoped end users so they don't click and get 403.
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["grok-profiles"],
    queryFn: () => api.get<Profile[]>("/api/profiles").then((r) => r.data).catch(() => [] as Profile[]),
    refetchInterval: 10_000,
  });

  const filtered = profiles.filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()),
  );

  // Backend endpoint is `check-session` (verifies cookie freshness),
  // NOT `test-login` (the latter doesn't exist — audited via OpenAPI).
  const refresh = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/profiles/${id}/check-session`).then((r) => r.data),
    onSuccess: (_, id) => {
      const p = profiles.find((x) => x.id === id);
      setLog((prev) => [...prev, { ts: nowTs(), level: "success", msg: `✓ Session check OK: ${p?.name}` }]);
      qc.invalidateQueries({ queryKey: ["grok-profiles"] });
    },
    onError: (e: any, id) => {
      const p = profiles.find((x) => x.id === id);
      const msg = e?.response?.data?.detail?.message ?? "Check failed";
      setLog((prev) => [...prev, { ts: nowTs(), level: "error", msg: `✗ ${p?.name}: ${msg}` }]);
    },
  });

  // Re-login flow: spin up a VNC session so admin can sign in via the
  // browser. After login, cookies get auto-uploaded and the profile
  // returns to logged_in.
  const startVnc = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/profiles/${id}/start-vnc-session`).then((r) => r.data),
    onSuccess: (data: any, id) => {
      const p = profiles.find((x) => x.id === id);
      setLog((prev) => [...prev, { ts: nowTs(), level: "info", msg: `▶ VNC session started: ${p?.name}` }]);
      // If the backend returns a VNC URL, open it for the admin.
      const vncUrl = data?.vnc_url || data?.url;
      if (vncUrl) window.open(vncUrl, "_blank", "width=1280,height=800");
      qc.invalidateQueries({ queryKey: ["grok-profiles"] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message ?? "Không mở được VNC";
      toast(msg, "error");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/profiles/${id}`),
    onSuccess: (_, id) => {
      const p = profiles.find((x) => x.id === id);
      setLog((prev) => [...prev, { ts: nowTs(), level: "warn", msg: `Đã xoá profile: ${p?.name}` }]);
      qc.invalidateQueries({ queryKey: ["grok-profiles"] });
    },
  });

  const loggedIn = profiles.filter((p) => p.status === "logged_in" || p.status === "running_job").length;
  const errored  = profiles.filter((p) => p.status === "error" || p.status === "logged_out").length;

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Grok Auto Login"
        subtitle="Quản lý các tài khoản Grok dùng để tạo nội dung — cookie tự lưu, auto refresh khi cần"
        accent="cyan"
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Shield} label="Tổng tài khoản" value={profiles.length} accent="cyan" />
        <StatCard icon={CheckCircle2} label="Đang hoạt động" value={loggedIn} accent="emerald" />
        <StatCard icon={AlertCircle} label="Cần xử lý" value={errored} accent="rose" />
        <StatCard icon={Monitor} label="Job đang chạy"
                  value={profiles.reduce((acc, p) => acc + p.active_jobs + p.active_video_jobs, 0)} accent="amber" />
      </div>

      {/* Toolbar */}
      <div className="cvp-card p-2.5 flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] px-2 py-1 bg-black/40 rounded-md ring-1 ring-white/5">
          <Search size={12} className="text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Tìm theo tên profile..."
                 className="flex-1 bg-transparent text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
        </div>
        <button className="cvp-btn-ghost inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5"
                onClick={() => qc.invalidateQueries({ queryKey: ["grok-profiles"] })}>
          <RefreshCw size={11} /> Refresh
        </button>
        {isAdmin && (
          <button className="cvp-btn-primary inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5"
                  onClick={() => setCreating(true)}>
            <Plus size={12} /> Thêm tài khoản
          </button>
        )}
      </div>

      {/* Accounts table */}
      <div className="cvp-card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-xs">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic flex flex-col items-center gap-2">
            <Shield size={32} className="text-slate-700" />
            {profiles.length === 0
              ? <>Chưa có tài khoản Grok nào — bấm <b className="text-cyan-300">"Thêm tài khoản"</b> để bắt đầu.</>
              : <>Không khớp với "{q}"</>}
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/5 bg-black/20">
                <th className="text-left px-3 py-2.5 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Profile</th>
                <th className="text-left px-3 py-2.5 w-36 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Trạng thái</th>
                <th className="text-left px-3 py-2.5 w-24 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Provider</th>
                <th className="text-right px-3 py-2.5 w-24 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Jobs</th>
                <th className="text-right px-3 py-2.5 w-32 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Hoạt động</th>
                <th className="text-right px-3 py-2.5 w-48 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="cvp-row border-t border-white/5">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg grid place-items-center text-[11px] font-bold text-white"
                           style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-200 font-medium truncate flex items-center gap-1.5">
                          {p.name}
                          {p.allows_video && (
                            <span className="text-[8px] font-bold px-1 rounded bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30" title="Cho phép video jobs">
                              VIDEO
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">{p.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <ProfileStatusPill status={p.status} />
                    {p.error_message && (
                      <div className="text-[9px] text-rose-400/80 mt-1 max-w-[140px] truncate" title={p.error_message}>
                        ⚠ {p.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-1.5 py-0.5 rounded bg-white/5 ring-1 ring-white/10">
                      {p.provider}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[11px] text-slate-300" title={`Image: ${p.active_jobs}/${p.max_concurrent_jobs} · Video: ${p.active_video_jobs}/${p.max_concurrent_video}`}>
                    <span className="text-cyan-300">{p.active_jobs}/{p.max_concurrent_jobs}</span>
                    <span className="text-slate-600 mx-1">·</span>
                    <span className="text-violet-300">{p.active_video_jobs}/{p.max_concurrent_video}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-[10px] text-slate-500 font-mono whitespace-nowrap"
                      title={`Check: ${p.last_login_check_at ?? "never"} · Used: ${p.last_used_at ?? "never"}`}>
                    {p.last_used_at ? timeAgo(p.last_used_at) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {!isAdmin ? (
                      <span className="text-[10px] text-slate-600 italic" title="Chỉ admin mới quản lý profile được">read-only</span>
                    ) : <div className="inline-flex gap-1">
                      <button onClick={() => refresh.mutate(p.id)}
                              disabled={refresh.isPending}
                              className="cvp-btn-ghost text-[10px] px-2 py-1 inline-flex items-center gap-1"
                              title="Test login">
                        <RefreshCw size={10} className={refresh.isPending ? "animate-spin" : ""} /> Test
                      </button>
                      <button onClick={() => startVnc.mutate(p.id)}
                              disabled={startVnc.isPending}
                              className="cvp-btn-ghost text-[10px] px-2 py-1 inline-flex items-center gap-1"
                              title="Mở VNC để login lại — cookie sẽ tự upload khi xong">
                        <Power size={10} className={startVnc.isPending ? "animate-pulse" : ""} /> Login lại
                      </button>
                      <button onClick={() => { if (confirm(`Xoá ${p.name}?`)) remove.mutate(p.id); }}
                              className="cvp-btn-ghost text-[10px] px-2 py-1 inline-flex items-center text-rose-400 hover:text-rose-300"
                              title="Xoá">
                        <Trash2 size={10} />
                      </button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LogPanel log={log} />

      {creating && <CreateAccountModal onClose={() => setCreating(false)}
                                       onCreated={() => {
                                         qc.invalidateQueries({ queryKey: ["grok-profiles"] });
                                         setLog((p) => [...p, { ts: nowTs(), level: "success", msg: "✓ Profile mới đã thêm" }]);
                                         setCreating(false);
                                       }} />}
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, accent,
}: { icon: typeof Shield; label: string; value: number; accent: "cyan" | "emerald" | "amber" | "rose" }) {
  const map = {
    cyan:    { bg: "rgba(6, 182, 212, 0.10)", ring: "rgba(6, 182, 212, 0.25)", text: "#67e8f9" },
    emerald: { bg: "rgba(16, 185, 129, 0.10)", ring: "rgba(16, 185, 129, 0.25)", text: "#6ee7b7" },
    amber:   { bg: "rgba(245, 158, 11, 0.10)", ring: "rgba(245, 158, 11, 0.25)", text: "#fcd34d" },
    rose:    { bg: "rgba(244, 63, 94, 0.10)", ring: "rgba(244, 63, 94, 0.25)", text: "#fda4af" },
  }[accent];
  return (
    <div className="cvp-card p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
           style={{ background: map.bg, boxShadow: `0 0 0 1px ${map.ring}` }}>
        <Icon size={16} style={{ color: map.text }} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
        <div className="text-xl font-bold font-mono" style={{ color: map.text }}>{value}</div>
      </div>
    </div>
  );
}

function ProfileStatusPill({ status }: { status: Profile["status"] }) {
  const map = {
    logged_in:   { cls: "cvp-pill-success", icon: CheckCircle2, label: "Đã login" },
    running_job: { cls: "cvp-pill-running", icon: null,         label: "Đang chạy job" },
    idle:        { cls: "cvp-pill-idle",    icon: null,         label: "Idle" },
    logged_out:  { cls: "cvp-pill-warning", icon: AlertCircle,  label: "Logged out" },
    error:       { cls: "cvp-pill-danger",  icon: XCircle,      label: "Lỗi" },
  } as const;
  const info = map[status];
  const Icon = info.icon;
  return (
    <span className={`cvp-pill ${info.cls}`}>
      {Icon && <Icon size={10} />}
      {info.label}
    </span>
  );
}

function CreateAccountModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/profiles", {
        name: name.trim() || email.split("@")[0],
        provider: "grok",
        email,
        password,
      }).then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Tạo profile thất bại", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="cvp-card w-full max-w-md p-5 space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-slate-100 inline-flex items-center gap-2">
            <Plus size={14} className="text-cyan-300" /> Thêm tài khoản Grok
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={14} />
          </button>
        </header>
        <div className="space-y-3">
          <Field icon={LogIn} label="Tên profile (tùy chọn)">
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="VD: grok04 — tài khoản chính"
                   className="cvp-input w-full" />
          </Field>
          <Field icon={Mail} label="Email Grok">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="user@example.com" autoFocus
                   className="cvp-input w-full" />
          </Field>
          <Field icon={KeyRound} label="Password">
            <div className="relative">
              <input type={showPwd ? "text" : "password"}
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="••••••••"
                     className="cvp-input w-full pr-10 font-mono" />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-300">
                {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </Field>
          <div className="text-[10px] text-slate-500 inline-flex items-start gap-1.5 px-2 py-1.5 rounded bg-amber-500/5 ring-1 ring-amber-400/15">
            <AlertCircle size={11} className="text-amber-400 mt-0.5 shrink-0" />
            <span>Tool sẽ mở Chromium VNC để login lần đầu. Sau khi cookie lưu xong, các lần sau sẽ dùng cookie tự động.</span>
          </div>
        </div>
        <footer className="flex justify-end gap-2 pt-2 border-t border-white/5">
          <button onClick={onClose} className="cvp-btn-ghost text-[11px] px-3 py-1.5">Hủy</button>
          <button onClick={() => create.mutate()}
                  disabled={!email || !password || create.isPending}
                  className="cvp-btn-primary inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5">
            {create.isPending ? <RefreshCw size={11} className="animate-spin" /> : <LogIn size={11} />}
            {create.isPending ? "Đang tạo..." : "Tạo + Mở VNC"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  icon: Icon, label, children,
}: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1 inline-flex items-center gap-1">
        <Icon size={9} /> {label}
      </div>
      {children}
    </div>
  );
}

function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return `${Math.round(sec)}s trước`;
  if (sec < 3600) return `${Math.round(sec / 60)}m trước`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h trước`;
  return `${Math.round(sec / 86400)}d trước`;
}
