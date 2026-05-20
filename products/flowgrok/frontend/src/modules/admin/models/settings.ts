export interface WebhookSettings {
  webhook_url: string | null;
  has_secret: boolean;
  new_secret?: string | null;
}

export interface LocaleSettings {
  locale: string | null;
}

export interface NotifPrefs {
  prefs: Record<string, { email: boolean; in_app: boolean }>;
}
