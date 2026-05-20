/** Shared formatters used across modules. Locale = vi-VN. */

/** Plain integer with thousands separator — 1500000 → "1.500.000". */
export const formatNum = (n: number): string =>
  new Intl.NumberFormat("vi-VN").format(n);

/** Compact form for tiles/KPI — 1_500_000 → "1.5M", 12_345 → "12.3K". */
export const formatCompact = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
};

/** VND amount with ₫ suffix. Accepts number or numeric-string (DB
 *  Decimal columns serialize to string). Rounds to integer (VND has
 *  no fractional unit). */
export const formatVnd = (n: number | string): string =>
  formatNum(Math.round(Number(n))) + "₫";

/** Compact VND for KPI tiles — 1_500_000 → "1.5M₫". */
export const formatVndCompact = (n: number): string =>
  formatCompact(Math.round(n)) + "₫";

/** Date-only VN locale. Null/empty → "—". */
export const formatDate = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleDateString("vi-VN") : "—";

/** Full VN datetime. Null/empty → "—". */
export const formatDateTime = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleString("vi-VN") : "—";

/** "5 phút trước" / "2 giờ trước" / "3 ngày trước". Falls back to full
 *  date if older than 7 days. */
export const formatRelative = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (Number.isNaN(diff) || diff < 0) return formatDateTime(iso);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return formatDate(iso);
};

/** "cut-video" → "Cut Video", "audit-logs" → "Audit Logs". */
export const titleize = (slug: string): string =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
