/** Vietnamese — default locale. Mirrors en.ts key set so a missing key
 *  in either file is obvious in code review. */
export interface Translations {
  [key: string]: string | Translations;
}

export const vi: Translations = {
  nav: {
    dashboard: "Tổng quan",
    api_keys: "API Keys",
    billing: "Thanh toán",
    audit_log: "Nhật ký",
    auth: "Xác thực",
    web: "Workspace",
    grok: "Studio AI",
    flow: "Flow",
    gateway: "Gateway",
    settings: "Cài đặt",
    admin: "Quản trị",
    roles: "Phân quyền",
    domains: "Tên miền",
    plans: "Gói dịch vụ",
    git: "Git / Triển khai",
    gallery: "Thư viện",
  },
  header: {
    logged_in_as: "Đăng nhập với",
    logout: "Đăng xuất",
    notifications: "Thông báo",
    mark_all_read: "Đánh dấu tất cả đã đọc",
    notif_empty: "Chưa có thông báo nào.",
    notif_config: "Cấu hình thông báo →",
  },
  settings: {
    title: "Cài đặt",
    tab_account: "Tài khoản",
    tab_webhook: "Webhook",
    tab_locale: "Ngôn ngữ",
    tab_notif: "Thông báo",
    tab_gallery: "Thư viện",
    locale_desc:
      "Chọn ngôn ngữ mặc định cho tài khoản. Một số label sidebar/header sẽ đổi ngay sau khi lưu.",
    locale_save: "Lưu",
    locale_saved: "Đã lưu ngôn ngữ. Refresh để áp dụng toàn bộ UI.",
    locale_current: "Hiện tại",
  },
  common: {
    save: "Lưu",
    cancel: "Hủy",
    delete: "Xóa",
    edit: "Sửa",
    refresh: "Làm mới",
    loading: "Đang tải...",
    search: "Tìm kiếm",
    all: "Tất cả",
    yes: "Có",
    no: "Không",
    apply: "Áp dụng",
    clear: "Xóa lọc",
  },
  landing: {
    now_playing: "Đang phát",
    badge: "Nền tảng AI đa năng",
    hero_title_1: "Một studio.",
    hero_title_2: "Mọi mô hình AI.",
    hero_subtitle:
      "Quản lý mọi dự án AI — sinh ảnh, video, văn bản, code — trong một giao diện duy nhất, theo phong cách bảng điều khiển âm nhạc.",
    cta_start: "Bắt đầu miễn phí",
    cta_explore: "Khám phá studio",
    modules_title: "Bộ sưu tập module",
    modules_subtitle: "Mỗi module là một album độc lập, kết hợp lại để chạy mọi pipeline AI.",
    pricing_title: "Gói đăng ký",
    pricing_subtitle: "Chọn cường độ phù hợp với playlist của bạn.",
    pricing_cta_free: "Dùng thử miễn phí",
    pricing_cta_paid: "Chọn gói",
    faq_title: "Câu hỏi thường gặp",
    final_cta_title: "Sẵn sàng bật playlist AI của bạn?",
    final_cta_sub:
      "Đăng nhập trong 30 giây. Không cần thẻ tín dụng cho gói khởi đầu.",
  },
};

export type TranslationKeys = Translations;
