import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Activity, Loader2 } from "lucide-react";

import { monitoringService } from "../services/monitoring.service";
import type { AlertSeverity } from "../services/monitoring.service";


/** Zabbix-style "Problems by severity" table. Top of /servers page.
 *
 *  One row per host (server), 5 cells for each severity bucket. The
 *  total in each cell is "currently-open alerts of this severity for
 *  this host". Cell colors mirror Zabbix: red / orange / yellow /
 *  cyan / blue. Empty cells stay grey so the eye lands on the active
 *  problems instantly. */
export function ProblemsWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-server-alerts-summary"],
    queryFn: () => monitoringService.alertsSummary(),
    refetchInterval: 15_000,
  });

  if (isError) {
    return (
      <div className="card border-rose-200 bg-rose-50/40 text-sm text-rose-700">
        Không kết nối được /api/admin/servers/alerts-summary
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="card flex items-center justify-center py-8 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Đang tải tình trạng…
      </div>
    );
  }

  const totalProblems = Object.values(data.totals).reduce((a, b) => a + b, 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {totalProblems > 0 ? (
            <AlertTriangle size={18} className="text-amber-500" />
          ) : (
            <Activity size={18} className="text-emerald-500" />
          )}
          <h2 className="text-sm font-bold text-slate-800">Problems by severity</h2>
          {totalProblems > 0 && (
            <span className="badge-rose text-xs">{totalProblems} đang mở</span>
          )}
        </div>
        <div className="text-[10px] text-slate-400">
          cập nhật {new Date(data.generated_at).toLocaleTimeString()}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 text-xs font-semibold text-slate-600">Host</th>
              <SeverityHeader name="Disaster" />
              <SeverityHeader name="High" />
              <SeverityHeader name="Average" />
              <SeverityHeader name="Warning" />
              <SeverityHeader name="Information" />
            </tr>
          </thead>
          <tbody>
            {data.per_server.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 italic">
                  Chưa có server nào được thêm.
                </td>
              </tr>
            ) : (
              data.per_server.map((row) => (
                <tr key={row.server_id} className="border-t border-slate-100 hover:bg-slate-50/40">
                  <td className="px-4 py-2">
                    <Link
                      to={`/servers/${row.server_id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {row.server_label}
                    </Link>
                  </td>
                  <SeverityCell count={row.disaster} sev="disaster" />
                  <SeverityCell count={row.high} sev="high" />
                  <SeverityCell count={row.average} sev="average" />
                  <SeverityCell count={row.warning} sev="warning" />
                  <SeverityCell count={row.information} sev="information" />
                </tr>
              ))
            )}
          </tbody>
          {data.per_server.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/50">
              <tr>
                <td className="px-4 py-2 text-xs font-semibold text-slate-600">Tổng</td>
                <SeverityCell count={data.totals.disaster} sev="disaster" bold />
                <SeverityCell count={data.totals.high} sev="high" bold />
                <SeverityCell count={data.totals.average} sev="average" bold />
                <SeverityCell count={data.totals.warning} sev="warning" bold />
                <SeverityCell count={data.totals.information} sev="information" bold />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}


function SeverityHeader({ name }: { name: string }) {
  return (
    <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-28">
      {name}
    </th>
  );
}


const SEV_BG: Record<AlertSeverity, string> = {
  disaster:    "bg-rose-500 text-white",
  high:        "bg-orange-500 text-white",
  average:     "bg-amber-400 text-amber-900",
  warning:     "bg-cyan-400 text-cyan-900",
  information: "bg-sky-400 text-sky-900",
};


function SeverityCell({
  count, sev, bold,
}: { count: number; sev: AlertSeverity; bold?: boolean }) {
  if (count === 0) {
    return (
      <td className="px-3 py-2 text-center text-slate-300 font-mono text-sm">—</td>
    );
  }
  return (
    <td className="px-3 py-2 text-center">
      <span
        className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded font-mono text-sm ${SEV_BG[sev]} ${
          bold ? "font-bold" : "font-semibold"
        }`}
      >
        {count}
      </span>
    </td>
  );
}
