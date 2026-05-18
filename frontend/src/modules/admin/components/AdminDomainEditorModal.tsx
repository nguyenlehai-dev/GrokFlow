import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import { PAGE_GROUPS } from "../configs/pageCatalog";
import type { Domain } from "../models/domain";
import { domainsService } from "../services/domains.service";

export function AdminDomainEditorModal({
  domain, isCreate, onClose,
}: { domain: Domain | null; isCreate: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
  const [requirePlaygroundKey, setRequirePlaygroundKey] = useState(domain?.require_playground_key ?? true);
  const [maintenanceMode, setMaintenanceMode] = useState(domain?.maintenance_mode ?? false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(domain?.maintenance_message ?? "");
  const [scheduleMinutes, setScheduleMinutes] = useState<string>(() => {
    if (!domain?.maintenance_starts_at) return "";
    const startsAt = new Date(domain.maintenance_starts_at).getTime();
    const remaining = Math.round((startsAt - Date.now()) / 60_000);
    return remaining > 0 ? String(remaining) : "";
  });
  const [maintenanceAnnouncement, setMaintenanceAnnouncement] = useState(
    domain?.maintenance_announcement ?? ""
  );
  const [loginTemplate, setLoginTemplate] = useState<"default" | "admin">(
    domain?.login_template ?? "default"
  );
  // Daily job quota — empty string in the UI = unlimited (NULL on the wire).
  // Stored as string in state so admin can clear the field; converted to
  // number-or-null when serializing the payload.
  const [jobsQuotaPerDay, setJobsQuotaPerDay] = useState<string>(
    domain?.jobs_quota_per_day != null ? String(domain.jobs_quota_per_day) : "",
  );
  // Quota reset hour (UTC 0-23). Default 0 = midnight UTC. 17 = midnight VN.
  const [quotaResetHourUtc, setQuotaResetHourUtc] = useState<string>(
    String(domain?.quota_reset_hour_utc ?? 0),
  );
  const ALL_PROFILE_ACTIONS = ["auto_login", "upload_cookies", "stop_vnc", "disable", "delete"] as const;
  const [allowedProfileActions, setAllowedProfileActions] = useState<string[]>(
    domain?.allowed_profile_actions ?? [...ALL_PROFILE_ACTIONS],
  );
  const toggleAction = (key: string) => {
    setAllowedProfileActions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

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
        require_playground_key: requirePlaygroundKey,
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage || null,
        maintenance_starts_at: (() => {
          const m = parseInt(scheduleMinutes, 10);
          if (!m || m <= 0) return null;
          return new Date(Date.now() + m * 60_000).toISOString();
        })(),
        maintenance_announcement: maintenanceAnnouncement || null,
        login_template: loginTemplate,
        allowed_profile_actions: allowedProfileActions,
        jobs_quota_per_day: jobsQuotaPerDay.trim() === ""
          ? null
          : Math.max(0, Math.floor(Number(jobsQuotaPerDay))),
        quota_reset_hour_utc: Math.min(23, Math.max(0, Math.floor(Number(quotaResetHourUtc) || 0))),
      };
      if (isCreate) payload.hostname = hostname;
      return isCreate
        ? domainsService.create(payload)
        : domainsService.update(domain!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      toast(isCreate ? t("admin.de_created") : t("admin.de_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("admin.de_save_error"), "error"),
  });

  const isDefault = domain?.hostname === "*";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">
          {isCreate ? t("admin.de_create_title") : t("admin.de_edit_title", { hostname: domain?.hostname ?? "" })}
          {isDefault && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              {t("admin.de_default_badge")}
            </span>
          )}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.de_hostname")}</label>
            <input
              className="input font-mono"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder={t("admin.de_hostname_placeholder")}
              disabled={!isCreate}
            />
            <p className="text-xs text-slate-500 mt-1">{t("admin.de_hostname_hint")}</p>
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.de_label")}</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={t("admin.de_label_placeholder")} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("admin.de_description")}</label>
          <input className="input" value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.de_status")}</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{t("admin.de_status_active")}</option>
              <option value="disabled">{t("admin.de_status_disabled")}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.de_brand_name")}</label>
            <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)}
              placeholder={t("admin.de_brand_placeholder")} />
          </div>
        </div>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.de_login_template_title", "Giao diện login")}</h3>
          <div>
            <label className="text-sm font-medium">
              {t("admin.de_login_template_label", "Login template")}
            </label>
            <select
              className="input"
              value={loginTemplate}
              onChange={(e) => setLoginTemplate(e.target.value as "default" | "admin")}
            >
              <option value="default">
                {t("admin.de_login_template_default", "Default (branded)")}
              </option>
              <option value="admin">
                {t("admin.de_login_template_admin", "Admin console (minimal)")}
              </option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {t(
                "admin.de_login_template_hint",
                "Khi user vào /login từ hostname này sẽ thấy template tương ứng. URL /admin/login luôn ép template 'admin'."
              )}
            </p>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.de_playground_title")}</h3>
          <Checkbox checked={requirePlaygroundKey} onChange={setRequirePlaygroundKey}>
            <strong>{t("admin.de_playground_require")}</strong>
            <span className="block text-xs text-slate-500">
              {t("admin.de_playground_require_hint")}
            </span>
          </Checkbox>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            ⚡ Quota Grok / ngày
            {jobsQuotaPerDay.trim() !== "" && (
              <span className="badge-cyan text-[10px]">{jobsQuotaPerDay}/ngày</span>
            )}
            <span className="badge-slate text-[10px]">Reset {quotaResetHourUtc.padStart(2, "0")}:00 UTC</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">
                Số job Grok tối đa / ngày
              </label>
              <input
                className="input mt-1"
                type="number"
                min={0}
                step={50}
                value={jobsQuotaPerDay}
                onChange={(e) => setJobsQuotaPerDay(e.target.value)}
                placeholder="Để trống = không giới hạn"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Khi tenant của domain này submit job vượt số này, backend trả 429.
                Áp dụng cho POST <code className="font-mono">/api/jobs</code> (cả batch +
                playground), không gồm gateway. Để trống = unlimited.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Giờ reset hằng ngày (UTC, 0-23)
              </label>
              <input
                className="input mt-1"
                type="number"
                min={0}
                max={23}
                value={quotaResetHourUtc}
                onChange={(e) => setQuotaResetHourUtc(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                💡 <strong>0 = 00:00 UTC</strong> (= 07:00 sáng VN). Muốn reset đúng
                <strong> 00:00 giờ Việt Nam</strong> → đặt <strong>17</strong>.
                Period rollover: từ giờ này hôm nay đến giờ này ngày mai.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            🔧 {t("admin.de_maint_title")}
            {maintenanceMode && (
              <span className="badge-amber text-[10px]">{t("admin.de_maint_on")}</span>
            )}
          </h3>
          <Checkbox checked={maintenanceMode} onChange={setMaintenanceMode}>
            <strong>{t("admin.de_maint_enable")}</strong>
            <span className="block text-xs text-slate-500">
              {t("admin.de_maint_enable_hint")}
            </span>
          </Checkbox>
          {maintenanceMode && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700">{t("admin.de_maint_msg_label")}</label>
                <textarea
                  className="input mt-1"
                  rows={3}
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  placeholder={t("admin.de_maint_msg_placeholder")}
                  maxLength={2000}
                />
                <p className="text-[10px] text-slate-500 mt-1">{t("admin.de_maint_msg_hint")}</p>
              </div>
              {!isCreate && domain?.hostname && domain.hostname !== "*" && (
                <a
                  href={`https://${domain.hostname}/?preview=maintenance`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm w-fit"
                >
                  {t("admin.de_maint_preview")}
                </a>
              )}
            </>
          )}

          <div className="border-t pt-3 mt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              {t("admin.de_schedule_title")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">
                  {t("admin.de_schedule_minutes_label")}
                </label>
                <input
                  className="input mt-1"
                  type="number"
                  min={0}
                  max={1440}
                  value={scheduleMinutes}
                  onChange={(e) => setScheduleMinutes(e.target.value)}
                  placeholder={t("admin.de_schedule_minutes_placeholder")}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("admin.de_schedule_minutes_hint")}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">
                  {t("admin.de_announcement_label")}
                </label>
                <input
                  className="input mt-1"
                  value={maintenanceAnnouncement}
                  onChange={(e) => setMaintenanceAnnouncement(e.target.value)}
                  placeholder={t("admin.de_announcement_placeholder")}
                  maxLength={2000}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("admin.de_announcement_hint")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.de_profile_actions_title")}</h3>
          <p className="text-xs text-slate-500">{t("admin.de_profile_actions_hint")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            <Checkbox
              checked={allowedProfileActions.includes("auto_login")}
              onChange={() => toggleAction("auto_login")}
            >
              <strong>{t("admin.de_pa_auto_login")}</strong>
              <span className="block text-xs text-slate-500">{t("admin.de_pa_auto_login_hint")}</span>
            </Checkbox>
            <Checkbox
              checked={allowedProfileActions.includes("upload_cookies")}
              onChange={() => toggleAction("upload_cookies")}
            >
              <strong>{t("admin.de_pa_upload_cookies")}</strong>
              <span className="block text-xs text-slate-500">{t("admin.de_pa_upload_cookies_hint")}</span>
            </Checkbox>
            <Checkbox
              checked={allowedProfileActions.includes("stop_vnc")}
              onChange={() => toggleAction("stop_vnc")}
            >
              <strong>{t("admin.de_pa_stop_vnc")}</strong>
              <span className="block text-xs text-slate-500">{t("admin.de_pa_stop_vnc_hint")}</span>
            </Checkbox>
            <Checkbox
              checked={allowedProfileActions.includes("disable")}
              onChange={() => toggleAction("disable")}
            >
              <strong>{t("admin.de_pa_disable")}</strong>
              <span className="block text-xs text-slate-500">{t("admin.de_pa_disable_hint")}</span>
            </Checkbox>
            <Checkbox
              checked={allowedProfileActions.includes("delete")}
              onChange={() => toggleAction("delete")}
            >
              <strong>{t("admin.de_pa_delete")}</strong>
              <span className="block text-xs text-slate-500">{t("admin.de_pa_delete_hint")}</span>
            </Checkbox>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.de_public_pages_title")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <Checkbox checked={allowLanding} onChange={setAllowLanding}>
              {t("admin.de_allow_landing")}
            </Checkbox>
            <Checkbox checked={allowRegister} onChange={setAllowRegister}>
              {t("admin.de_allow_register")}
            </Checkbox>
            <Checkbox checked={allowLogin} onChange={setAllowLogin}>
              {t("admin.de_allow_login")}
            </Checkbox>
          </div>
        </section>

        <section className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("admin.de_authed_pages_title")}</h3>
            <Checkbox checked={allowAllPages} onChange={setAllowAllPages}>
              <strong>{t("admin.de_all_pages")}</strong>
            </Checkbox>
          </div>
          {!allowAllPages && (
            <div className="space-y-3">
              {PAGE_GROUPS.map((group) => {
                const groupPaths = group.items.map((i) => i.path);
                const allOn = groupPaths.every((p) => allowedPages.includes(p));
                const someOn = !allOn && groupPaths.some((p) => allowedPages.includes(p));
                const toggleGroup = () => {
                  setAllowedPages((prev) =>
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
                      <span className="text-xs text-slate-500">
                        {allOn ? t("admin.de_group_all") : someOn ? `(${groupPaths.filter((p) => allowedPages.includes(p)).length}/${groupPaths.length})` : ""}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 pl-5 text-sm">
                      {group.items.map((p) => (
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
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-500">{t("admin.de_admin_note")}</p>
        </section>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">{t("common.cancel")}</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !hostname || !label}
            className="btn-primary"
          >
            {save.isPending
              ? t("common.saving")
              : isCreate
                ? t("common.create")
                : t("common.save")}
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
