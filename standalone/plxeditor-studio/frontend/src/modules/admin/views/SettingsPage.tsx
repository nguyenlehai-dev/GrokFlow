import { useState } from "react";
import { useTranslation } from "react-i18next";
import { User as UserIcon, Webhook, Globe, Bell } from "lucide-react";
import { SettingsAccountTab } from "../components/SettingsAccountTab";
import { SettingsWebhookTab } from "../components/SettingsWebhookTab";
import { SettingsLocaleTab } from "../components/SettingsLocaleTab";
import { SettingsNotificationsTab } from "../components/SettingsNotificationsTab";

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

export function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("account");

  const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
    { key: "account",  label: t("settings.tab_account"),  icon: UserIcon },
    { key: "webhook",  label: t("settings.tab_webhook"),  icon: Webhook },
    { key: "locale",   label: t("settings.tab_locale"),   icon: Globe },
    { key: "notif",    label: t("settings.tab_notif"),    icon: Bell },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="page-title">{t("settings.title")}</h1>

      <div className="card p-0 overflow-x-auto">
        <div className="flex items-stretch border-b border-slate-200">
          {TABS.map((tab_) => {
            const Icon = tab_.icon;
            const active = tab === tab_.key;
            return (
              <button
                key={tab_.key}
                type="button"
                onClick={() => setTab(tab_.key)}
                className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                  active ? "text-blue-700" : "text-slate-600 hover:bg-white hover:text-slate-800"
                }`}
              >
                <Icon size={14} />
                {tab_.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {tab === "account" && <SettingsAccountTab />}
        {tab === "webhook" && <SettingsWebhookTab />}
        {tab === "locale" && <SettingsLocaleTab />}
        {tab === "notif" && <SettingsNotificationsTab />}
      </div>
    </div>
  );
}
