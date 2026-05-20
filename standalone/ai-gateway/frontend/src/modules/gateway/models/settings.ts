export interface AutomationSettings {
  headless: boolean;
  concurrency: number;
  timeout_ms: number;
}

export interface SettingsData {
  automation: AutomationSettings;
}
