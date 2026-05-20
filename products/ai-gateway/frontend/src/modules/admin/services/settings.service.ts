import { api } from "@/core/api/axios";

import type {
  WebhookSettings,
  LocaleSettings,
  NotifPrefs,
} from "../models/settings";

export const settingsService = {
  changePassword: (payload: { current_password: string; new_password: string }) =>
    api.post("/api/settings/password", payload),

  getWebhook: () =>
    api.get<WebhookSettings>("/api/settings/webhook").then((r) => r.data),
  saveWebhook: (payload: {
    webhook_url: string | null;
    rotate_secret: boolean;
  }) =>
    api
      .put<WebhookSettings>("/api/settings/webhook", payload)
      .then((r) => r.data),

  getLocale: () =>
    api.get<LocaleSettings>("/api/settings/locale").then((r) => r.data),
  saveLocale: (locale: string) =>
    api.put("/api/settings/locale", { locale }),

  getNotifications: () =>
    api.get<NotifPrefs>("/api/settings/notifications").then((r) => r.data),
  saveNotifications: (prefs: NotifPrefs["prefs"]) =>
    api.put("/api/settings/notifications", { prefs }),
};
