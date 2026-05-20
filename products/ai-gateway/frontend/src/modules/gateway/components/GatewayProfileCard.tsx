import { useTranslation } from "react-i18next";
import {
  Pencil, Trash2, Activity, LogIn, Loader2, Image as ImageIcon,
} from "lucide-react";
import { providerVisuals } from "../configs/providerVisuals";
import type { SessionCheckRecord } from "../configs/providerVisuals";
import type { Profile } from "../models/profile";
import type { ProxyRef } from "../models/proxy";

export function GatewayProfileCard({
  profile, proxies, session, busy, onEdit, onDelete,
  onUploadCookies, onSessionCheck, onLaunchLogin,
}: {
  profile: Profile;
  proxies: ProxyRef[];
  session: SessionCheckRecord | undefined;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadCookies: (file: File) => void;
  onSessionCheck: () => void;
  onLaunchLogin: () => void;
}) {
  const { t } = useTranslation();
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
    <div className="card overflow-x-auto p-0">
      <div className="flex items-start gap-3 p-4 border-l-4" style={{ borderLeftColor: v.accent }}>
        <img src={v.image} alt={v.label} className="w-10 h-10 rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-800">{profile.name}</h3>
              <p className="text-xs text-slate-500">
                {v.label} · {profile.concurrency_limit} {t("gateway.profile_card_slot")} · {t("gateway.profile_card_proxy")}:{" "}
                <span className="font-mono">{proxy?.name ?? "—"}</span>
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={onEdit} className="btn-ghost text-xs" title={t("gateway.profile_card_edit")}>
                <Pencil size={12} className="inline mr-1" /> {t("gateway.profile_card_edit")}
              </button>
              <button onClick={onDelete} className="btn-ghost text-rose-600 text-xs">
                <Trash2 size={12} className="inline mr-1" /> {t("gateway.profile_card_delete")}
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
        <div className="p-3 space-y-2 border-r border-slate-200">
          <div className="text-xs font-semibold text-slate-600">{t("gateway.profile_card_cookies")}</div>
          <span className={`text-xs px-2 py-0.5 rounded inline-block ${profile.cookie_file ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {profile.cookie_file ? t("gateway.profile_card_cookies_imported") : t("gateway.profile_card_cookies_missing")}
          </span>
          <label className="block">
            <span className="sr-only">{t("gateway.profile_card_upload")}</span>
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
          <p className="text-[10px] text-slate-400">{t("gateway.profile_card_cookies_format")}</p>
        </div>

        {/* Session block */}
        <div className="p-3 space-y-2 border-r border-slate-200">
          <div className="text-xs font-semibold text-slate-600">{t("gateway.profile_card_session")}</div>
          <div className="flex flex-wrap gap-1">
            <span className={`text-xs px-2 py-0.5 rounded ${stateColor}`}>
              {session?.state ?? "unchecked"}
            </span>
            {session?.requires_live_browser && (
              <span className={`text-xs px-2 py-0.5 rounded ${session.live_browser_connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {session.live_browser_connected ? t("gateway.profile_card_browser_live") : t("gateway.profile_card_browser_closed")}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 line-clamp-3">
            {session?.summary ?? t("gateway.profile_card_session_hint")}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={onSessionCheck}
              disabled={busy}
              className="btn-ghost text-xs inline-flex items-center gap-1"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
              {t("gateway.profile_card_check_session")}
            </button>
            <button
              onClick={onLaunchLogin}
              className="btn-ghost text-xs inline-flex items-center gap-1"
              title={t("gateway.profile_card_launch_login_title")}
            >
              <LogIn size={12} /> {t("gateway.profile_card_launch_login")}
            </button>
          </div>
          {session?.screenshot_data_url && (
            <details className="mt-1">
              <summary className="text-xs text-brand-600 cursor-pointer">
                <ImageIcon size={12} className="inline mr-1" /> {t("gateway.profile_card_view_screenshot")}
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
          <div className="text-xs font-semibold text-slate-600">{t("gateway.profile_card_storage")}</div>
          <div className="text-[10px] text-slate-500 font-mono break-all">
            cache: {profile.cache_dir}
          </div>
          <div className="text-[10px] text-slate-500 font-mono break-all">
            user_data: {profile.user_data_dir}
          </div>
          <div className="text-[10px] text-slate-400">
            {t("gateway.profile_card_updated")}: {new Date(profile.updated_at).toLocaleString("vi-VN")}
          </div>
        </div>
      </div>
    </div>
  );
}
