import { useRouteError, isRouteErrorResponse, Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from "lucide-react";

/** Catches errors thrown by route loaders, actions, and the React tree under
 *  a route. Replaces React Router's developer-facing default message with a
 *  branded "not found / something went wrong" screen the end user can act on.
 *
 *  Handles two shapes:
 *    - Route 404 / response errors (isRouteErrorResponse): show a "page not
 *      found" body, link back to /dashboard.
 *    - Generic thrown Errors: show the message + a Reload button. We don't
 *      expose stack traces — production users don't need them and they leak
 *      backend / file paths.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let status = 500;
  let title = "Đã có lỗi xảy ra";
  let message = "Có lỗi không mong đợi khi tải trang. Thử reload xem có hết không.";

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (status === 404) {
      title = "Không tìm thấy trang";
      message =
        "URL bạn vừa truy cập không tồn tại hoặc đã bị xóa. Quay lại Dashboard nhé.";
    } else if (status === 403) {
      title = "Không có quyền truy cập";
      message = "Tài khoản của bạn không được phép xem trang này.";
    } else {
      title = `Lỗi ${status}`;
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message || message;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle size={28} className="text-amber-600" />
        </div>
        <p className="mt-4 text-xs uppercase tracking-wider text-slate-500 font-mono">
          HTTP {status}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost border border-slate-200 inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Quay lại
          </button>
          <Link
            to="/dashboard"
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Home size={14} /> Về Dashboard
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="btn-ghost border border-slate-200 inline-flex items-center gap-1.5"
            title="Tải lại trang"
          >
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      </div>
    </div>
  );
}
