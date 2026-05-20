/** Job error code hints + parser shared between JobsPage and
 *  JobDetailDrawer. Provider attaches a `[code] rest` prefix to
 *  `error_message`; UI parses it to display a friendly hint. */

export const ERROR_HINTS: Record<string, string> = {
  rate_limited: "Tài khoản Grok bị giới hạn — đợi cooldown hoặc dùng profile khác.",
  cookie_expired: "Phiên Grok hết hạn — admin Auto-login lại.",
  captcha_required: "Grok yêu cầu captcha — admin mở VNC giải.",
  provider_blocked: "Account thiếu quyền (cần Pro/Premium/Heavy).",
  browser_crashed: "Chromium crash — sẽ retry.",
  network_error: "Lỗi mạng — sẽ retry.",
  timeout: "Grok không trả kết quả — sẽ retry.",
  retries_exhausted: "Hết số lần retry. Bấm Retry để thử lại.",
  unknown_error: "Lỗi chưa xác định. Xem chi tiết log bên dưới.",
  unsupported_job_type: "Provider hiện không hỗ trợ loại job này.",
  content_moderated: "Ảnh upload vi phạm chính sách của Grok — đổi ảnh khác.",
};

export function parseErrorCode(msg: string | null): { code: string; rest: string } | null {
  if (!msg) return null;
  const m = msg.match(/^\[([a-z_]+)\]\s*(.*)$/);
  if (!m) return null;
  return { code: m[1], rest: m[2] };
}
