import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Layers } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";

interface Profile {
  id: string | number;
  name?: string;
  status?: string;
  [key: string]: any;
}

export function GatewayProfilesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gateway-profiles"],
    queryFn: async () => (await gatewayApi.get<Profile[]>("/api/profiles")).data,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers size={22} /> Gateway — Profiles
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Profile pool của gatewaygrok-backend. Dữ liệu lấy qua <code>/gateway-api/api/profiles</code>.
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error ? (
        <BackendUnavailable error={error} />
      ) : !data || data.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          Chưa có profile nào trong gatewaygrok-backend.
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Raw</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={String(p.id)} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{String(p.id).slice(0, 12)}</td>
                  <td className="px-3 py-2 font-medium">{p.name ?? "—"}</td>
                  <td className="px-3 py-2">{p.status ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 font-mono truncate max-w-xs">
                    {JSON.stringify(p).slice(0, 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BackendUnavailable({ error }: { error: any }) {
  const msg = error?.response?.status
    ? `HTTP ${error.response.status}`
    : error?.message ?? "không xác định";
  return (
    <div className="card max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle size={20} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">gatewaygrok-backend chưa sẵn sàng</h2>
          <p className="text-sm text-slate-600 mt-1">Lỗi: <code>{msg}</code></p>
          <p className="text-sm text-slate-600 mt-3">Để gateway hoạt động, admin cần:</p>
          <ol className="text-sm text-slate-600 list-decimal pl-5 mt-1 space-y-1">
            <li>Deploy <code>gatewaygrok-backend</code> chạy trên VPS port 8001</li>
            <li>Thêm nginx proxy <code>/gateway-api/* → 127.0.0.1:8001</code></li>
            <li>
              Vào <a href="/admin/git" className="text-brand-600 underline">/admin/git</a>
              {" "}thêm repo <code>nguyenlehai-dev/gatewaygrok-backend</code> để quản lý deploy.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
