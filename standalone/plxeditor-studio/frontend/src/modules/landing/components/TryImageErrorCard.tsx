// ─── Error card ───────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function TryImageErrorCard({ error, isAuth }: { error: any; isAuth: boolean }) {
  const detail = error?.response?.data?.detail;
  const code = detail?.code;
  const msg = detail?.message ?? error?.message ?? "Có lỗi xảy ra";
  const isQuotaError = code === "anon_quota_exhausted";

  return (
    <div className="rounded-2xl p-5 bg-rose-50 ring-1 ring-rose-200 flex items-start gap-3">
      <AlertTriangle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-rose-900">
          {isQuotaError ? "Hết lượt thử miễn phí" : "Không tạo được ảnh"}
        </p>
        <p className="text-sm text-rose-800 mt-0.5">{msg}</p>
        {isQuotaError && !isAuth && (
          <Link
            to="/register"
            className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-violet-700 hover:text-violet-800"
          >
            Đăng ký tài khoản → nhận quota cao hơn <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
