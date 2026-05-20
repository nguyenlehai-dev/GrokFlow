import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Key, Loader2 } from "lucide-react";

import { apiKeysService } from "@/modules/admin/services/apiKeys.service";
import { FlowShell } from "./FlowShell";

interface Props {
  children: ReactNode;
  workspaceLabel?: string;
}

/** Gate around Flow Jobs pages — caller must have at least one API key
 *  before they can run a video processing operation. The /flow/docs page
 *  doesn't sit behind this gate (read-only docs are useful pre-signup).
 *
 *  Returns a friendly CTA instead of a blank page when there are no keys
 *  yet — clicking the button drops the user on /api-keys where they can
 *  mint one in three clicks.
 *
 *  Cache: 30s stale + window-focus refetch off so navigating between
 *  tool pages doesn't refire the query for every menu item.
 */
export function ApiKeyGuard({ children, workspaceLabel }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["api-keys-count-for-flow"],
    queryFn: () => apiKeysService.list({ status: "active" }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <FlowShell workspaceLabel={workspaceLabel ?? "Loading"}>
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </FlowShell>
    );
  }

  const hasKey = Array.isArray(data) && data.length > 0;
  if (hasKey) return <>{children}</>;

  return (
    <FlowShell workspaceLabel={workspaceLabel ?? "API Key required"}>
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <Key className="h-6 w-6 text-amber-700" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">
          Tạo API Key trước khi dùng Flow Jobs
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Mỗi tài khoản cần ít nhất 1 API Key đang hoạt động để chạy video job
          (kể cả khi dùng giao diện này). Tạo nhanh ở trang{" "}
          <code className="rounded bg-white px-1 py-0.5 text-xs text-slate-700">
            API Keys
          </code>
          , copy giá trị về máy, rồi quay lại đây.
        </p>
        <Link
          to="/api-keys"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          <Key className="h-4 w-4" />
          Mở trang API Keys
        </Link>
        <p className="mt-3 text-xs text-slate-500">
          Đã có Key nhưng vẫn thấy màn này? Bấm <strong>Refresh</strong> trình duyệt.
        </p>
      </div>
    </FlowShell>
  );
}
