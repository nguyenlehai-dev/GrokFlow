import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export function AuditLogPage() {
  const me = useAuthStore((s) => s.user);
  const [actionFilter, setActionFilter] = useState("");
  const [scope, setScope] = useState<"self" | "admin">("self");

  const url = scope === "admin" ? "/api/audit-logs/admin" : "/api/audit-logs";

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", scope, actionFilter],
    queryFn: async () => {
      const params = actionFilter ? { action: actionFilter } : {};
      return (await api.get<AuditLog[]>(url, { params })).data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <div className="flex gap-2">
          {(me?.role === "admin" || me?.role === "super_admin") && (
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="self">Của tôi</option>
              <option value="admin">Tất cả (admin)</option>
            </select>
          )}
          <input
            className="input"
            placeholder="filter action (e.g. login)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-2 text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2 text-xs">{l.target_type ? `${l.target_type}:${l.target_id?.slice(0, 8)}` : "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.user_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-2 max-w-md truncate font-mono text-xs">
                    {l.metadata ? JSON.stringify(l.metadata) : "—"}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Không có log nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
