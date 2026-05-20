import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UploadCookiesModal } from "../components/UploadCookiesModal";
import { AutoLoginModal } from "../components/AutoLoginModal";
import { ProjectsModal } from "../components/ProjectsModal";
import { SystemHealButton } from "../components/SystemHealButton";
import type { Profile } from "../models/profile";
import { profilesService } from "../services/profiles.service";

export function ProfilesPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isAdmin = (me?.role === "admin" || me?.role === "super_admin");
  const isSuper = me?.role === "super_admin";
  // Super_admin always sees every action; tenant admins respect the
  // per-domain allowlist set by super_admin in the Domain editor.
  const domainConfig = useDomainStore((s) => s.config);
  const allowedActions = domainConfig?.allowed_profile_actions
    ?? ["auto_login", "upload_cookies", "stop_vnc", "disable", "delete"];
  const can = (key: string) => isSuper || allowedActions.includes(key);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => profilesService.list(),
    refetchInterval: 4000,  // poll so slot count updates live
  });
  const [open, setOpen] = useState(false);
  const [cookiesFor, setCookiesFor] = useState<string | null>(null);
  const [autoLoginFor, setAutoLoginFor] = useState<string | null>(null);
  // Per-row state for the domain assignment modal — super_admin only.
  const [projectsFor, setProjectsFor] = useState<{ id: string; name: string } | null>(null);
  // Client-side filter by tier. "all" shows everything; specific tiers
  // narrow the table to that bucket so admin can scan "heavy only".
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "heavy" | "pro">("all");

  const disable = useMutation({
    mutationFn: (id: string) => profilesService.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const resetStuck = useMutation({
    mutationFn: (id: string) => profilesService.resetStuck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const resetCdp = useMutation({
    mutationFn: (id: string) => profilesService.resetCdp(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      // eslint-disable-next-line no-alert
      alert(`Reset CDP xong: ${data.message}\n\nClick "Auto login" để mở phiên mới.`);
    },
  });
  const stopVnc = useMutation({
    mutationFn: (id: string) => profilesService.stopVnc(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => profilesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const updateMax = useMutation({
    mutationFn: ({ id, max }: { id: string; max: number }) =>
      profilesService.update(id, { max_concurrent_jobs: max }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const updateMaxVideo = useMutation({
    mutationFn: ({ id, max }: { id: string; max: number }) =>
      profilesService.update(id, { max_concurrent_video: max }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  // Toggle that decides whether a profile is allowed to accept video
  // jobs. Off ⇒ the resolver (backend) skips this profile when picking
  // for video — the video slots column is also greyed out below.
  const updateAllowsVideo = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      profilesService.update(id, { allows_video: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  // Tier change — cosmetic only, drives the row badge + filter.
  const updateTier = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) =>
      profilesService.update(id, { tier }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isAdmin ? <>{t("grok.profiles_admin_title_a")} <span className="text-gradient">{t("grok.profiles_admin_title_b")}</span></> : t("grok.profiles_user_title")}
          </h1>
          <p className="page-subtitle">
            {isAdmin
              ? t("grok.profiles_admin_subtitle")
              : t("grok.profiles_user_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuper && <SystemHealButton />}
          {isAdmin && (
            <button onClick={() => setOpen(true)} className="btn-primary">+ {t("grok.profiles_create")}</button>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="alert-warning">
          <span className="text-xl leading-none">⚠️</span>
          <div className="flex-1 space-y-2">
            <p className="font-semibold text-amber-900">{t("grok.profiles_alert_title")}</p>
            <p>
              {t("grok.profiles_alert_intro_a")} <code className="px-1 bg-amber-100 rounded text-xs">invalid-parent-post</code> {t("grok.profiles_alert_intro_or")}{" "}
              <code className="px-1 bg-amber-100 rounded text-xs">rate_limited</code>.
            </p>
            <p><strong>{t("grok.profiles_alert_howto")}</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>{t("grok.profiles_alert_temp_label")}</strong> {t("grok.profiles_alert_temp_a")} <em>Disable</em> {t("grok.profiles_alert_temp_b")}
              </li>
              <li>
                <strong>{t("grok.profiles_alert_long_label")}</strong> {t("grok.profiles_alert_long_body")}
              </li>
              <li>
                <strong>{t("grok.profiles_alert_watch_label")}</strong> {t("grok.profiles_alert_watch_a")} <code className="px-1 bg-amber-100 rounded text-xs">rate_limited</code> {t("grok.profiles_alert_watch_in")}{" "}
                <a href="/jobs" className="underline text-amber-700 font-medium">{t("grok.profiles_alert_watch_jobs")}</a> {t("grok.profiles_alert_watch_b")}
              </li>
            </ul>
            <p className="text-xs text-amber-700 mt-2">
              {t("grok.profiles_alert_note")}
            </p>
          </div>
        </div>
      )}

      {/* Tier filter chips. Counts re-derived from the live data so the UI
          stays accurate after admin edits a tier. */}
      {data && data.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Tier:</span>
          {(["all", "free", "heavy", "pro"] as const).map((tierKey) => {
            const count = tierKey === "all"
              ? data.length
              : data.filter((p) => ((p as { tier?: string }).tier ?? "free") === tierKey).length;
            const active = tierFilter === tierKey;
            return (
              <button
                key={tierKey}
                onClick={() => setTierFilter(tierKey)}
                className={`px-2.5 py-1 rounded-full ring-1 transition-colors ${
                  active
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="uppercase font-semibold">{tierKey}</span>
                <span className={`ml-1 ${active ? "text-slate-300" : "text-slate-400"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500">{t("grok.profiles_loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-4 py-2">{t("grok.profiles_th_name")}</th>
                <th className="px-4 py-2">{t("grok.profiles_th_provider")}</th>
                <th className="px-4 py-2">{t("grok.profiles_th_status")}</th>
                <th className="px-4 py-2" title={t("grok.profiles_th_mode_title")}>{t("grok.profiles_th_mode")}</th>
                <th className="px-4 py-2" title={t("grok.profiles_th_image_slots_title")}>{t("grok.profiles_th_image_slots")}</th>
                <th className="px-4 py-2" title={t("grok.profiles_th_video_slots_title")}>{t("grok.profiles_th_video_slots")}</th>
                <th className="px-4 py-2">{t("grok.profiles_th_last_used")}</th>
                {isAdmin && <th className="px-4 py-2">{t("grok.profiles_th_actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {data?.filter((p) => {
                if (tierFilter === "all") return true;
                return ((p as { tier?: string }).tier ?? "free") === tierFilter;
              }).map((p) => {
                const usage = p.max_concurrent_jobs > 0 ? p.active_jobs / p.max_concurrent_jobs : 0;
                const slotColor = usage >= 1 ? "text-rose-600" : usage >= 0.7 ? "text-amber-600" : "text-emerald-600";
                const allowsVideo = p.allows_video !== false; // default true for old rows
                const videoUsage = allowsVideo && p.max_concurrent_video > 0
                  ? (p.active_video_jobs ?? 0) / p.max_concurrent_video
                  : 0;
                const videoColor = !allowsVideo
                  ? "text-slate-400"
                  : videoUsage >= 1
                  ? "text-rose-600"
                  : videoUsage >= 0.7
                  ? "text-amber-600"
                  : "text-emerald-600";
                const tier = (p as { tier?: string }).tier ?? "free";
                const tierBadge =
                  tier === "heavy"
                    ? "bg-amber-100 text-amber-800 ring-amber-200"
                    : tier === "pro"
                    ? "bg-violet-100 text-violet-800 ring-violet-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200";
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium flex items-center gap-2">
                        {p.name}
                        {isAdmin ? (
                          <select
                            value={tier}
                            onChange={(e) => updateTier.mutate({ id: p.id, tier: e.target.value })}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 cursor-pointer ${tierBadge}`}
                            title="Tier (chỉ để label / lọc — không ảnh hưởng routing)"
                          >
                            <option value="free">FREE</option>
                            <option value="heavy">HEAVY</option>
                            <option value="pro">PRO</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${tierBadge} uppercase font-semibold`}>
                            {tier}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">{p.provider}</td>
                    <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2">
                      <ModeToggle
                        allowsVideo={allowsVideo}
                        canEdit={!!isAdmin}
                        busy={updateAllowsVideo.isPending}
                        onChange={(v) => updateAllowsVideo.mutate({ id: p.id, value: v })}
                        labelImageOnly={t("grok.profiles_mode_image_only")}
                        labelBoth={t("grok.profiles_mode_image_video")}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-mono font-semibold ${slotColor}`}>
                        {p.active_jobs}/{p.max_concurrent_jobs}
                      </span>
                      {isAdmin && (
                        <input
                          type="number"
                          min={1}
                          max={16}
                          defaultValue={p.max_concurrent_jobs}
                          className="ml-2 w-14 px-2 py-0.5 text-xs border rounded"
                          title={t("grok.profiles_edit_max_image_title")}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v >= 1 && v <= 16 && v !== p.max_concurrent_jobs) {
                              updateMax.mutate({ id: p.id, max: v });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`font-mono font-semibold ${videoColor}`}
                        title={!allowsVideo ? t("grok.profiles_video_disabled_hint") : undefined}
                      >
                        {allowsVideo
                          ? `${p.active_video_jobs ?? 0}/${p.max_concurrent_video ?? 4}`
                          : "—"}
                      </span>
                      {isAdmin && allowsVideo && (
                        <input
                          type="number"
                          min={1}
                          max={12}
                          defaultValue={p.max_concurrent_video ?? 4}
                          className="ml-2 w-14 px-2 py-0.5 text-xs border rounded"
                          title={t("grok.profiles_edit_max_video_title")}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v >= 1 && v <= 12 && v !== p.max_concurrent_video) {
                              updateMaxVideo.mutate({ id: p.id, max: v });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs">
                      {p.last_used_at ? new Date(p.last_used_at).toLocaleString() : "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button
                          className="btn-primary"
                          onClick={() => setAutoLoginFor(p.id)}
                          disabled={!can("auto_login")}
                          title={!can("auto_login") ? t("grok.profiles_action_blocked_title") : undefined}
                        >
                          {t("grok.profiles_action_auto_login")}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => setCookiesFor(p.id)}
                          disabled={!can("upload_cookies")}
                          title={
                            !can("upload_cookies")
                              ? t("grok.profiles_action_blocked_title")
                              : t("grok.profiles_action_upload_cookies_title")
                          }
                        >
                          {t("grok.profiles_action_upload_cookies")}
                        </button>
                        {isSuper && (
                          <button
                            className="btn-ghost"
                            onClick={() => setProjectsFor({ id: p.id, name: p.name })}
                            title={t("grok.profiles_action_projects_title")}
                          >
                            {t("grok.profiles_action_projects")}
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          onClick={() => stopVnc.mutate(p.id)}
                          disabled={!can("stop_vnc")}
                          title={
                            !can("stop_vnc")
                              ? t("grok.profiles_action_blocked_title")
                              : t("grok.profiles_action_stop_title")
                          }
                        >
                          {t("grok.profiles_action_stop")}
                        </button>
                        {p.status === "running_job" && (
                          <button
                            className="btn-ghost text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                            onClick={() => resetStuck.mutate(p.id)}
                            disabled={resetStuck.isPending}
                            title="Reset profile bị kẹt ở Running — đồng bộ lại counter và mở khoá slot"
                          >
                            {resetStuck.isPending && resetStuck.variables === p.id ? "Đang reset…" : "Reset kẹt"}
                          </button>
                        )}
                        <button
                          className="btn-ghost text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                          onClick={() => {
                            if (confirm("Reset CDP sẽ XOÁ VNC container hiện tại + làm mới nginx map. Bạn cần Auto-login lại sau khi reset. Tiếp tục?")) {
                              resetCdp.mutate(p.id);
                            }
                          }}
                          disabled={resetCdp.isPending || !can("stop_vnc")}
                          title="Fix khi Chromium crash bên trong VNC (CDP discovery error). Sau khi reset → click Auto login để mở phiên mới."
                        >
                          {resetCdp.isPending && resetCdp.variables === p.id ? "Đang reset…" : "Reset CDP"}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => disable.mutate(p.id)}
                          disabled={!can("disable")}
                          title={!can("disable") ? t("grok.profiles_action_blocked_title") : undefined}
                        >
                          {t("grok.profiles_action_disable")}
                        </button>
                        <button
                          className="btn-ghost text-rose-600"
                          onClick={() => remove.mutate(p.id)}
                          disabled={!can("delete")}
                          title={!can("delete") ? t("grok.profiles_action_blocked_title") : undefined}
                        >
                          {t("grok.profiles_action_delete")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                    {isAdmin ? t("grok.profiles_empty_admin") : t("grok.profiles_empty_user")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateProfileModal onClose={() => setOpen(false)} />}
      {cookiesFor && <UploadCookiesModal profileId={cookiesFor} onClose={() => setCookiesFor(null)} />}
      {autoLoginFor && <AutoLoginModal profileId={autoLoginFor} onClose={() => setAutoLoginFor(null)} />}
      {projectsFor && (
        <ProjectsModal
          profileId={projectsFor.id}
          profileName={projectsFor.name}
          onClose={() => setProjectsFor(null)}
        />
      )}
    </div>
  );
}

/** Pill-style two-option toggle: "Ảnh + Video" / "Chỉ ảnh".
 *  - Customers see it as a read-only badge.
 *  - Admins click to flip; backend call rejects mid-flight so the UI
 *    optimistic state stays in sync via React Query invalidation.
 *  - Greyed out while the mutation is in flight to avoid double-clicks. */
function ModeToggle({
  allowsVideo, canEdit, busy, onChange, labelImageOnly, labelBoth,
}: {
  allowsVideo: boolean;
  canEdit: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
  labelImageOnly: string;
  labelBoth: string;
}) {
  const label = allowsVideo ? labelBoth : labelImageOnly;
  const tone = allowsVideo
    ? "bg-violet-100 text-violet-700 border-violet-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  if (!canEdit) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border ${tone}`}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onChange(!allowsVideo)}
      disabled={busy}
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border transition ${tone} hover:opacity-80 disabled:opacity-50`}
      title="Click để chuyển chế độ"
    >
      {label}
    </button>
  );
}


interface CreateValues {
  name: string;
  provider: "grok" | "flow";
  max_concurrent_jobs: number;
  allows_video: boolean;
  tier: string;
}

function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { provider: "grok", max_concurrent_jobs: 4, allows_video: true, tier: "free" },
  });
  const onSubmit = async (v: CreateValues) => {
    await profilesService.create({
      ...v,
      max_concurrent_jobs: Number(v.max_concurrent_jobs),
      allows_video: Boolean(v.allows_video),
      tier: v.tier,
    });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{t("grok.profiles_modal_title")}</h2>
        <div>
          <label className="text-sm font-medium">{t("grok.profiles_modal_name")}</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("grok.profiles_modal_provider")}</label>
          <select className="input" {...register("provider")}>
            <option value="grok">Grok</option>
            <option value="flow">Flow</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Tier (gói acc)</label>
          <select className="input" {...register("tier")}>
            <option value="free">Free — acc miễn phí (~5/day)</option>
            <option value="heavy">Heavy — SuperGrok Premium (~500/day)</option>
            <option value="pro">Pro — acc trả phí cao cấp</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Chỉ là label phân loại để dễ quản lý — không ảnh hưởng routing.
            Có thể đổi sau ở row profile.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">{t("grok.profiles_modal_max_jobs")}</label>
          <input
            type="number"
            min={1}
            max={16}
            className="input"
            {...register("max_concurrent_jobs", { required: true, min: 1, max: 16 })}
          />
          <p className="text-xs text-slate-500 mt-1">
            {t("grok.profiles_modal_max_jobs_hint")}
          </p>
        </div>
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input type="checkbox" className="mt-1" {...register("allows_video")} />
          <span>
            <span className="text-sm font-medium">{t("grok.profiles_modal_allows_video")}</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              {t("grok.profiles_modal_allows_video_hint")}
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("grok.profiles_modal_cancel")}</button>
          <button className="btn-primary" disabled={isSubmitting}>{t("grok.profiles_modal_create")}</button>
        </div>
      </form>
    </div>
  );
}
