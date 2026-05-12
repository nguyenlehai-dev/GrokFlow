import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { BackendUnavailable } from "./GatewayProfilesPage";

interface Proxy {
  id: string | number;
  label?: string;
  host?: string;
  port?: number;
  status?: string;
  [key: string]: any;
}

export function GatewayProxiesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gateway-proxies"],
    queryFn: async () => (await gatewayApi.get<Proxy[]>("/api/proxies")).data,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitBranch size={22} /> Gateway — Proxies
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Proxy pool dùng cho Grok automation. <code>/gateway-api/api/proxies</code>.
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error ? (
        <BackendUnavailable error={error} />
      ) : !data || data.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          Chưa có proxy nào.
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Host:Port</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={String(p.id)} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{String(p.id).slice(0, 12)}</td>
                  <td className="px-3 py-2 font-medium">{p.label ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{p.host}:{p.port}</td>
                  <td className="px-3 py-2">{p.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
