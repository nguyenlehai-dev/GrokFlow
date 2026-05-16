import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { NotifPrefs } from "../models/settings";
import { settingsService } from "../services/settings.service";

// Event-kind labels. Kept hard-coded (not in i18n) because they map 1:1 to
// backend `Notification.kind` strings and are also referenced in audit
// logs — Vietnamese reads fine for now; can move to i18n later if needed.
const NOTIF_LABEL: Record<string, string> = {
  job_completed:        "Grok job hoàn tất (success)",
  job_failed:           "Grok job lỗi (failed)",
  flow_completed:       "Flow video xử lý xong",
  billing_due:          "Hóa đơn sắp đến hạn",
  domain_assignment:    "Được gán quyền vào domain mới",
  profile_login_needed: "Profile cần đăng nhập lại (cookies hết hạn)",
  system_announcement:  "Thông báo hệ thống / bảo trì",
};

export function SettingsNotificationsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings-notif-prefs"],
    queryFn: () => settingsService.getNotifications(),
  });
  const [local, setLocal] = useState<NotifPrefs["prefs"] | null>(null);
  const prefs = local ?? data?.prefs ?? {};

  const save = useMutation({
    mutationFn: () => settingsService.saveNotifications(prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-notif-prefs"] });
      toast(t("common.saved"), "success");
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
      <h2 className="font-semibold flex items-center gap-2 text-slate-800">
        <Bell size={16} /> {t("settings.notif_title")}
      </h2>
      <p className="text-sm text-slate-600">{t("settings.notif_desc")}</p>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                {t("settings.notif_event")}
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">
                {t("settings.notif_in_app")}
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">
                {t("settings.notif_email")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {Object.keys(NOTIF_LABEL).map((event) => {
              const p = prefs[event] ?? { email: false, in_app: true };
              return (
                <tr key={event}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{NOTIF_LABEL[event]}</div>
                    <code className="text-xs text-slate-400 font-mono">{event}</code>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.in_app}
                      onChange={() => toggle(event, "in_app")}
                      className="h-4 w-4 rounded border-slate-200 accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.email}
                      onChange={() => toggle(event, "email")}
                      className="h-4 w-4 rounded border-slate-200 accent-blue-600"
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
          {save.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </section>
  );
}
