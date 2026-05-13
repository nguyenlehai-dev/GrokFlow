/** Vietnamese — default locale. Mirrors en.ts key set so a missing key
 *  in either file is obvious in code review. Only the ~50 top-of-app
 *  strings are wrapped today; rest of the UI stays Vietnamese-hardcoded
 *  until phase 2 finishes wrapping.
 *
 *  Typed as a recursive Record<string, string|Translations> via the
 *  Translations helper rather than `as const` — `as const` froze every
 *  value into a literal type which made en.ts un-assignable since its
 *  English strings don't match the Vietnamese literal types.
 */
export interface Translations {
  [key: string]: string | Translations;
}

export const vi: Translations = {
  nav: {
    dashboard: "Dashboard",
    api_keys: "API Keys",
    billing: "Billing",
    audit_log: "Audit Log",
    auth: "Auth",
    web: "Web",
    grok: "Quản lý Grok",
    flow: "Quản lý Flow",
    gateway: "Gateway Management",
    settings: "Setting",
    admin: "Admin",
    roles: "Roles",
    domains: "Domains",
    plans: "Plans / Gói",
    git: "Git / Deploy",
  },
  header: {
    logged_in_as: "Logged in as",
    logout: "Logout",
    notifications: "Thông báo",
    mark_all_read: "Đánh dấu tất cả đã đọc",
    notif_empty: "Chưa có thông báo nào.",
    notif_config: "Cấu hình thông báo →",
  },
  settings: {
    title: "Settings",
    tab_account: "Tài khoản",
    tab_webhook: "Webhook",
    tab_locale: "Đa ngôn ngữ",
    tab_notif: "Thông báo",
    tab_gallery: "Grok Gallery",
    locale_desc:
      "Chọn ngôn ngữ mặc định cho tài khoản. Toàn bộ UI sẽ được dịch trong phase 2 — hiện preference đã được lưu, một số label sidebar/header sẽ đổi ngay.",
    locale_save: "Lưu",
    locale_saved: "Đã lưu ngôn ngữ. Refresh để áp dụng toàn bộ UI.",
    locale_current: "Hiện tại",
  },
  common: {
    save: "Lưu",
    cancel: "Hủy",
    delete: "Xóa",
    edit: "Sửa",
    refresh: "Refresh",
    loading: "Đang tải...",
    search: "Tìm kiếm",
    all: "Tất cả",
    yes: "Có",
    no: "Không",
    apply: "Áp dụng",
    clear: "Xóa lọc",
  },
};

// Back-compat alias for the previous typeof export.
export type TranslationKeys = Translations;
