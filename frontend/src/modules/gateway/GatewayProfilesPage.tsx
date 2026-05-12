import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Layers, Plus, Pencil, Trash2, AlertCircle, Activity, LogIn,
  Loader2, Image as ImageIcon,
} from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { providerVisuals } from "./providerVisuals";
import type { Category, SessionCheckRecord } from "./providerVisuals";

interface Profile {
  id: string;
  name: string;
  category: Category;
  description: string | null;
  is_active: boolean;
  proxy_id: string | null;
  tags: string[];
  antidetect: any;
  concurrency_limit: number;
  cookie_file: string | null;
  cache_dir: string;
  user_data_dir: string;
  created_at: string;
  updated_at: string;
}

interface ProxyRecord {
  id: string;
  name: string;
}

export function GatewayProfilesPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [sessionChecks, setSessionChecks] = useState<Record<string, SessionCheckRecord>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ["gw-profiles"],
    queryFn: async () => (await gatewayApi.get<Profile[]>("/api/profiles")).data,
    retry: false,
  });
  const { data: proxies } = useQuery({
    queryKey: ["gw-proxies"],
    queryFn: async () => (await gatewayApi.get<ProxyRecord[]>("/api/proxies")).data,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gatewayApi.delete(`/api/profiles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast("Đã xóa profile", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const uploadCookies = async (profileId: string, file: File) => {
    setBusyId(profileId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await gatewayApi.post(`/api/profiles/${profileId}/cookies`, fd);
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast("Cookies đã import — chạy Session check kế tiếp", "success");
      await runSessionCheck(profileId);
    } catch (e: any) {
      toast(extractError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const runSessionCheck = async (profileId: string) => {
    setBusyId(profileId);
    try {
      const { data } = await gatewayApi.post<SessionCheckRecord>(
        `/api/profiles/${profileId}/session-check`,
      );
      setSessionChecks((p) => ({ ...p, [profileId]: data }));
    } catch (e: any) {
      toast(extractError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const launchLogin = async (profileId: string) => {
    try {
      const { data } = await gatewayApi.post<{ message: string }>(
        `/api/profiles/${profileId}/launch-login`,
      );
      toast(data.message ?? "Launched interactive login", "info");
    } catch (e: any) {
      toast(extractError(e), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers size={22} /> Gateway — Profiles
        </h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo profile
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="space-y-3">
          {(profiles ?? []).map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              proxies={proxies ?? []}
              session={sessionChecks[p.id]}
              busy={busyId === p.id}
              onEdit={() => setEditing(p)}
              onDelete={() => confirm(`Xóa profile ${p.name}?`) && remove.mutate(p.id)}
              onUploadCookies={(file) => uploadCookies(p.id, file)}
              onSessionCheck={() => runSessionCheck(p.id)}
              onLaunchLogin={() => launchLogin(p.id)}
            />
          ))}
          {(profiles ?? []).length === 0 && (
            <div className="card text-center text-slate-500 py-10">
              Chưa có profile. Click "Tạo profile" để bắt đầu.
            </div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <ProfileEditorModal
          profile={editing}
          isCreate={creating}
          proxies={proxies ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function ProfileCard({
  profile, proxies, session, busy, onEdit, onDelete,
  onUploadCookies, onSessionCheck, onLaunchLogin,
}: {
  profile: Profile;
  proxies: ProxyRecord[];
  session: SessionCheckRecord | undefined;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadCookies: (file: File) => void;
  onSessionCheck: () => void;
  onLaunchLogin: () => void;
}) {
  const v = providerVisuals[profile.category];
  const proxy = proxies.find((p) => p.id === profile.proxy_id);
  const stateColor =
    session?.state === "ready" || session?.state === "logged_in"
      ? "bg-emerald-100 text-emerald-700"
      : session?.state === "security_verification" || session?.state === "needs_login"
      ? "bg-amber-100 text-amber-700"
      : session?.state === "blocked" || session?.state === "error"
      ? "bg-rose-100 text-rose-700"
      : "bg-slate-100 text-slate-600";

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4 border-l-4" style={{ borderLeftColor: v.accent }}>
        <img src={v.image} alt={v.label} className="w-10 h-10 rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">{profile.name}</h3>
              <p className="text-xs text-slate-500">
                {v.label} · {profile.concurrency_limit} slot · proxy:{" "}
                <span className="font-mono">{proxy?.name ?? "—"}</span>
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={onEdit} className="btn-ghost text-xs" title="Sửa">
                <Pencil size={12} className="inline mr-1" /> Sửa
              </button>
              <button onClick={onDelete} className="btn-ghost text-rose-600 text-xs">
                <Trash2 size={12} className="inline mr-1" /> Xóa
              </button>
            </div>
          </div>

          {profile.tags.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {profile.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 border-t border-slate-200">
        {/* Cookies block */}
        <div className="p-3 space-y-2 border-r border-slate-100">
          <div className="text-xs font-semibold text-slate-600">COOKIES</div>
          <span className={`text-xs px-2 py-0.5 rounded inline-block ${profile.cookie_file ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {profile.cookie_file ? "Đã import" : "Thiếu cookies"}
          </span>
          <label className="block">
            <span className="sr-only">Upload</span>
            <input
              type="file"
              accept=".txt,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadCookies(f);
                e.target.value = "";
              }}
              className="block w-full text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-brand-50 file:text-brand-700 file:cursor-pointer"
            />
          </label>
          <p className="text-[10px] text-slate-400">Netscape (.txt) hoặc JSON</p>
        </div>

        {/* Session block */}
        <div className="p-3 space-y-2 border-r border-slate-100">
          <div className="text-xs font-semibold text-slate-600">SESSION</div>
          <div className="flex flex-wrap gap-1">
            <span className={`text-xs px-2 py-0.5 rounded ${stateColor}`}>
              {session?.state ?? "unchecked"}
            </span>
            {session?.requires_live_browser && (
              <span className={`text-xs px-2 py-0.5 rounded ${session.live_browser_connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {session.live_browser_connected ? "browser live" : "browser closed"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 line-clamp-3">
            {session?.summary ?? "Chạy Session check sau khi import cookies."}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={onSessionCheck}
              disabled={busy}
              className="btn-ghost text-xs inline-flex items-center gap-1"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
              Check session
            </button>
            <button
              onClick={onLaunchLogin}
              className="btn-ghost text-xs inline-flex items-center gap-1"
              title="Mở browser headed để admin login thủ công (chỉ chạy trên host có display)"
            >
              <LogIn size={12} /> Launch login
            </button>
          </div>
          {session?.screenshot_data_url && (
            <details className="mt-1">
              <summary className="text-xs text-brand-600 cursor-pointer">
                <ImageIcon size={12} className="inline mr-1" /> Xem screenshot
              </summary>
              <img
                src={session.screenshot_data_url}
                alt="session check"
                className="mt-2 w-full rounded border border-slate-200"
              />
              <p className="text-[10px] text-slate-400 mt-1 break-all">{session.page_url}</p>
            </details>
          )}
        </div>

        {/* Storage block */}
        <div className="p-3 space-y-1.5">
          <div className="text-xs font-semibold text-slate-600">STORAGE</div>
          <div className="text-[10px] text-slate-500 font-mono break-all">
            cache: {profile.cache_dir}
          </div>
          <div className="text-[10px] text-slate-500 font-mono break-all">
            user_data: {profile.user_data_dir}
          </div>
          <div className="text-[10px] text-slate-400">
            updated: {new Date(profile.updated_at).toLocaleString("vi-VN")}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileEditorModal({
  profile, isCreate, proxies, onClose,
}: {
  profile: Profile | null;
  isCreate: boolean;
  proxies: ProxyRecord[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: profile?.name ?? "",
      category: (profile?.category ?? "grok") as Category,
      description: profile?.description ?? "",
      is_active: profile?.is_active ?? true,
      proxy_id: profile?.proxy_id ?? "",
      concurrency_limit: profile?.concurrency_limit ?? 1,
      tags: (profile?.tags ?? []).join(", "),
      user_agent: profile?.antidetect?.user_agent ?? "",
      locale: profile?.antidetect?.locale ?? "en-US",
      timezone_id: profile?.antidetect?.timezone_id ?? "UTC",
      color_scheme: profile?.antidetect?.color_scheme ?? "dark",
      viewport_width: profile?.antidetect?.viewport_width ?? 1440,
      viewport_height: profile?.antidetect?.viewport_height ?? 900,
      platform: profile?.antidetect?.platform ?? "Win32",
      hardware_concurrency: profile?.antidetect?.hardware_concurrency ?? 8,
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        category: v.category,
        description: v.description || null,
        is_active: v.is_active,
        proxy_id: v.proxy_id || null,
        concurrency_limit: Number(v.concurrency_limit),
        tags: v.tags ? v.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        antidetect: {
          user_agent: v.user_agent || null,
          locale: v.locale || null,
          timezone_id: v.timezone_id || null,
          color_scheme: v.color_scheme || null,
          viewport_width: Number(v.viewport_width),
          viewport_height: Number(v.viewport_height),
          platform: v.platform || null,
          hardware_concurrency: Number(v.hardware_concurrency),
        },
      };
      return isCreate
        ? gatewayApi.post("/api/profiles", payload)
        : gatewayApi.put(`/api/profiles/${profile!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-3"
      >
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo profile" : `Sửa: ${profile?.name}`}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input className="input" {...register("name", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select className="input" {...register("category")} disabled={!isCreate}>
              <option value="grok">Grok</option>
              <option value="flow">Flow</option>
              <option value="dreamina">Dreamina</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Proxy</label>
            <select className="input" {...register("proxy_id")}>
              <option value="">No proxy</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Concurrency limit</label>
            <input className="input" type="number" min={1}
              {...register("concurrency_limit", { valueAsNumber: true })} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Description</label>
            <input className="input" {...register("description")} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Tags (dấu phẩy)</label>
            <input className="input" {...register("tags")} placeholder="prod, vn" />
          </div>
        </div>

        <details className="border-t pt-3">
          <summary className="text-sm font-semibold cursor-pointer text-slate-700">
            Antidetect (fingerprint browser)
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">User agent</label>
              <input className="input font-mono text-xs" {...register("user_agent")} />
            </div>
            <div>
              <label className="text-sm font-medium">Locale</label>
              <input className="input" {...register("locale")} />
            </div>
            <div>
              <label className="text-sm font-medium">Timezone</label>
              <input className="input" {...register("timezone_id")} />
            </div>
            <div>
              <label className="text-sm font-medium">Color scheme</label>
              <select className="input" {...register("color_scheme")}>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Platform</label>
              <input className="input" {...register("platform")} />
            </div>
            <div>
              <label className="text-sm font-medium">Viewport width</label>
              <input className="input" type="number"
                {...register("viewport_width", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="text-sm font-medium">Viewport height</label>
              <input className="input" type="number"
                {...register("viewport_height", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="text-sm font-medium">Hardware concurrency</label>
              <input className="input" type="number"
                {...register("hardware_concurrency", { valueAsNumber: true })} />
            </div>
          </div>
        </details>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_active")} />
          <span>Active</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ErrorPanel({ error }: { error: any }) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail ?? error?.message ?? "Lỗi không xác định";

  return (
    <div className="card border-rose-200 bg-rose-50/30">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-rose-600 mt-0.5" />
        <div>
          <h2 className="font-semibold">Lỗi gọi gateway</h2>
          <p className="text-sm text-slate-600 mt-1">
            HTTP {status ?? "?"}: <code>{typeof detail === "string" ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200)}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export function extractError(e: any): string {
  const d = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return d.summary ?? d.message ?? JSON.stringify(d);
  return "Lỗi";
}
