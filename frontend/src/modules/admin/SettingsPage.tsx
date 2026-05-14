import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  User as UserIcon, KeyRound, Webhook, Globe, Bell,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import { setLocale } from "@/core/i18n";

/** Tabbed settings page — each tab is a small functional area.
 *
 *  Tabs:
 *    Tài khoản      — read-only identity + password change
 *    Webhook        — existing webhook config
 *    Đa ngôn ngữ    — locale switcher (vi/en today)
 *    Thông báo      — per-event-type notification preferences
 *
 *  (Gallery lives in its own sidebar group at /gallery/{images,videos,prompts}.
 *  The legacy tab here was removed because it duplicated that nav entry.)
 */

type TabKey = "account" | "webhook" | "locale" | "notif";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "account",  label: "Tài khoản",     icon: UserIcon },
  { key: "webhook",  label: "Webhook",       icon: Webhook },
  { key: "locale",   label: "Đa ngôn ngữ",   icon: Globe },
  { key: "notif",    label: "Thông báo",     icon: Bell },
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("account");
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="page-title">Settings</h1>

      <div className="card p-0 overflow-x-auto">
        <div className="flex items-stretch border-b border-ink-800">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                  active ? "text-violet-700" : "text-ink-300 hover:bg-ink-900 hover:text-white"
                }`}
              >
                <Icon size={14} />
                {t.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-600" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {tab === "account" && <AccountTab />}
        {tab === "webhook" && <WebhookSection />}
        {tab === "locale" && <LocaleTab />}
        {tab === "notif" && <NotificationsTab />}
      </div>
    </div>
  );
}

// ─── Account ────────────────────────────────────────────────────────────
function AccountTab() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <section className="card space-y-2">
        <h2 className="font-semibold">Tài khoản</h2>
        <p className="text-sm text-ink-300">Email: <span className="font-medium">{user?.email}</span></p>
        <p className="text-sm text-ink-300">Role: <span className="font-medium">{user?.role}</span></p>
        <p className="text-sm text-ink-300">Status: <span className="font-medium">{user?.status}</span></p>
      </section>
      <PasswordSection />
    </>
  );
}

function PasswordSection() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ current_password: string; new_password: string }>();
  const onSubmit = async (v: { current_password: string; new_password: string }) => {
    await api.post("/api/settings/password", v);
    toast("Đổi password thành công", "success");
    reset();
  };
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><KeyRound size={16} /> Đổi mật khẩu</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <div>
          <label className="text-sm font-medium">Mật khẩu hiện tại</label>
          <input type="password" className="input" {...register("current_password", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Mật khẩu mới (≥8 ký tự)</label>
          <input type="password" className="input" {...register("new_password", { required: true, minLength: 8 })} />
        </div>
        <button className="btn-primary" disabled={isSubmitting}>Đổi password</button>
      </form>
    </section>
  );
}

// ─── Webhook ────────────────────────────────────────────────────────────
interface WebhookOut {
  webhook_url: string | null;
  has_secret: boolean;
  new_secret?: string | null;
}

function WebhookSection() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["webhook"],
    queryFn: async () => (await api.get<WebhookOut>("/api/settings/webhook")).data,
  });
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ webhook_url: string; rotate_secret: boolean }>({
    values: { webhook_url: data?.webhook_url ?? "", rotate_secret: false },
  });
  const [revealed, setRevealed] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (payload: { webhook_url: string; rotate_secret: boolean }) =>
      (await api.put<WebhookOut>("/api/settings/webhook", {
        webhook_url: payload.webhook_url || null,
        rotate_secret: payload.rotate_secret,
      })).data,
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ["webhook"] });
      if (out.new_secret) {
        setRevealed(out.new_secret);
        toast("Đã rotate webhook secret. Copy ngay!", "success");
      } else {
        toast("Webhook đã cập nhật", "success");
      }
    },
  });

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Webhook size={16} /> Webhook (job complete)</h2>
      <p className="text-sm text-ink-300">
        Server sẽ POST event <code>job.success</code> / <code>job.failed</code> / <code>job.cancelled</code> tới URL này.
        Header <code>X-Grokflow-Signature</code> = HMAC-SHA256(secret, body) base64.
      </p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-2">
        <div>
          <label className="text-sm font-medium">Webhook URL</label>
          <input type="url" placeholder="https://your-app.com/webhooks/grokflow" className="input"
            {...register("webhook_url")} />
        </div>
        <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" {...register("rotate_secret")} /> Rotate secret
        </label>
        <p className="text-xs text-ink-400">
          Trạng thái secret: {data?.has_secret ? "đã có" : "chưa có"}
          {data?.has_secret ? " — không thể xem lại, chỉ rotate." : ""}
        </p>
        <button className="btn-primary" disabled={isSubmitting}>Lưu</button>
      </form>

      {revealed && (
        <div className="border-2 border-emerald-500 rounded p-3 space-y-2">
          <div className="font-medium text-emerald-700 text-sm">Webhook secret mới — copy ngay, không thể xem lại:</div>
          <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs whitespace-pre-wrap break-all">{revealed}</pre>
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(revealed)}>Copy</button>
          <button className="btn-ghost ml-2" onClick={() => setRevealed(null)}>Tôi đã lưu</button>
        </div>
      )}
    </section>
  );
}

// ─── Locale (i18n preference) ───────────────────────────────────────────
function LocaleTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings-locale"],
    queryFn: async () => (await api.get<{ locale: string | null }>("/api/settings/locale")).data,
  });
  const [pick, setPick] = useState<string | null>(null);
  const current = pick ?? data?.locale ?? "vi";
  const save = useMutation({
    mutationFn: (locale: string) => api.put("/api/settings/locale", { locale }),
    onSuccess: (_data, locale) => {
      qc.invalidateQueries({ queryKey: ["settings-locale"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      // Switch i18next immediately so the user sees the locale change
      // without an explicit refresh — at least for the wrapped strings.
      setLocale(locale);
      toast("Đã lưu ngôn ngữ. Refresh để áp dụng toàn bộ UI.", "success");
    },
  });
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Globe size={16} /> Đa ngôn ngữ</h2>
      <p className="text-sm text-ink-300">
        Chọn ngôn ngữ mặc định cho tài khoản. Toàn bộ UI sẽ được dịch trong phase 2 —
        hiện preference đã được lưu, một số label sidebar/header sẽ đổi ngay.
      </p>
      <div className="flex items-center gap-3">
        <select
          className="input w-48"
          value={current}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
        <button
          className="btn-primary"
          disabled={!pick || pick === data?.locale || save.isPending}
          onClick={() => pick && save.mutate(pick)}
        >
          {save.isPending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
      <p className="text-xs text-ink-500">
        Hiện tại: <code>{data?.locale ?? "(chưa đặt — auto detect từ browser)"}</code>
      </p>
    </section>
  );
}

// ─── Notifications preferences ──────────────────────────────────────────
interface NotifPrefs {
  prefs: Record<string, { email: boolean; in_app: boolean }>;
}

const NOTIF_LABEL: Record<string, string> = {
  job_completed:        "Grok job hoàn tất (success)",
  job_failed:           "Grok job lỗi (failed)",
  flow_completed:       "Flow video xử lý xong",
  billing_due:          "Hóa đơn sắp đến hạn",
  domain_assignment:    "Được gán quyền vào domain mới",
  profile_login_needed: "Profile cần đăng nhập lại (cookies hết hạn)",
  system_announcement:  "Thông báo hệ thống / bảo trì",
};

function NotificationsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings-notif-prefs"],
    queryFn: async () => (await api.get<NotifPrefs>("/api/settings/notifications")).data,
  });
  const [local, setLocal] = useState<NotifPrefs["prefs"] | null>(null);
  const prefs = local ?? data?.prefs ?? {};

  const save = useMutation({
    mutationFn: () => api.put("/api/settings/notifications", { prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-notif-prefs"] });
      toast("Đã lưu preference thông báo", "success");
      setLocal(null);
    },
  });

  const toggle = (event: string, channel: "email" | "in_app") => {
    setLocal((cur) => {
      const base = cur ?? { ...(data?.prefs ?? {}) };
      const entry = base[event] ?? { email: false, in_app: true };
      return { ...base, [event]: { ...entry, [channel]: !entry[channel] } };
    });
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Bell size={16} /> Thông báo</h2>
      <p className="text-sm text-ink-300">
        Chọn kênh nhận từng loại sự kiện. <strong>In-app</strong> hiện ngay ở chuông góc trên, <strong>Email</strong> gửi sau (phase 2 sẽ wire email service).
      </p>

      <div className="overflow-hidden rounded-md border border-ink-800">
        <table className="w-full text-sm">
          <thead className="bg-ink-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-ink-300">Sự kiện</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-ink-300">In-app</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-ink-300">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {Object.keys(NOTIF_LABEL).map((event) => {
              const p = prefs[event] ?? { email: false, in_app: true };
              return (
                <tr key={event}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink-200">{NOTIF_LABEL[event]}</div>
                    <code className="text-xs text-ink-500">{event}</code>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.in_app}
                      onChange={() => toggle(event, "in_app")}
                      className="h-4 w-4 rounded border-ink-700 accent-violet-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.email}
                      onChange={() => toggle(event, "email")}
                      className="h-4 w-4 rounded border-ink-700 accent-violet-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          className="btn-primary"
          disabled={!local || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </section>
  );
}

