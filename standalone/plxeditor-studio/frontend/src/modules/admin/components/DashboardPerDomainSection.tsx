import { useState } from "react";
import { Globe, ChevronUp, ChevronDown } from "lucide-react";
import type { Period, DomainStats } from "../models/dashboard";
import { PERIOD_LABEL } from "./DashboardKpi";
import { formatNum, formatVnd } from "@/core/utils/format";

type SortKey = "jobs_total" | "jobs_image" | "jobs_video" | "jobs_failed"
  | "users" | "profiles" | "api_keys" | "revenue" | "last_activity";

export function DashboardPerDomainSection({ rows, period }: { rows: DomainStats[]; period: Period }) {
  const [sortKey, setSortKey] = useState<SortKey>("jobs_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const sorted = [...rows]
    .filter((r) => !search || (r.hostname ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // `last_activity` strings sort lexicographically by ISO — same as time.
      const av = (a[sortKey] ?? 0) as number | string;
      const bv = (b[sortKey] ?? 0) as number | string;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  // Totals row for the footer — adds up everything visible.
  const totals = sorted.reduce(
    (acc, r) => ({
      users: acc.users + r.users,
      jobs_total: acc.jobs_total + r.jobs_total,
      jobs_image: acc.jobs_image + r.jobs_image,
      jobs_video: acc.jobs_video + r.jobs_video,
      jobs_failed: acc.jobs_failed + r.jobs_failed,
      profiles: acc.profiles + r.profiles,
      api_keys: acc.api_keys + r.api_keys,
      revenue: acc.revenue + r.revenue,
    }),
    { users: 0, jobs_total: 0, jobs_image: 0, jobs_video: 0,
      jobs_failed: 0, profiles: 0, api_keys: 0, revenue: 0 },
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-violet-600" />
          <h2 className="font-semibold">Thống kê theo Domain</h2>
          <span className="text-xs text-slate-500">
            ({PERIOD_LABEL[period].toLowerCase()})
          </span>
        </div>
        <input
          className="input w-56 text-sm"
          placeholder="Tìm domain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white text-left">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <SortHeader k="users" sk={sortKey} sd={sortDir} onClick={toggleSort}>Users</SortHeader>
              <SortHeader k="jobs_total" sk={sortKey} sd={sortDir} onClick={toggleSort}>Jobs</SortHeader>
              <SortHeader k="jobs_image" sk={sortKey} sd={sortDir} onClick={toggleSort}>Ảnh</SortHeader>
              <SortHeader k="jobs_video" sk={sortKey} sd={sortDir} onClick={toggleSort}>Video</SortHeader>
              <SortHeader k="jobs_failed" sk={sortKey} sd={sortDir} onClick={toggleSort}>Lỗi</SortHeader>
              <SortHeader k="profiles" sk={sortKey} sd={sortDir} onClick={toggleSort}>Profile</SortHeader>
              <SortHeader k="api_keys" sk={sortKey} sd={sortDir} onClick={toggleSort}>API Key</SortHeader>
              <SortHeader k="revenue" sk={sortKey} sd={sortDir} onClick={toggleSort}>Doanh thu</SortHeader>
              <SortHeader k="last_activity" sk={sortKey} sd={sortDir} onClick={toggleSort}>Hoạt động cuối</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Chưa có domain nào khớp.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const successRate = r.jobs_total > 0
                  ? Math.round((r.jobs_success / r.jobs_total) * 100)
                  : null;
                return (
                  <tr key={r.domain_id ?? "no-domain"} className="border-t hover:bg-white">
                    <td className="px-3 py-2">
                      {r.hostname ? (
                        <span className="font-medium text-slate-700">{r.hostname}</span>
                      ) : (
                        <span className="text-slate-9000 italic">(không có domain)</span>
                      )}
                      {successRate !== null && (
                        <span
                          className={`ml-2 text-[10px] font-mono ${
                            successRate >= 90 ? "text-emerald-600"
                            : successRate >= 70 ? "text-amber-600"
                            : "text-rose-600"
                          }`}
                          title="Tỷ lệ job thành công"
                        >
                          {successRate}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatNum(r.users)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                      {formatNum(r.jobs_total)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-cyan-700">{formatNum(r.jobs_image)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-rose-700">{formatNum(r.jobs_video)}</td>
                    <td className={`px-3 py-2 font-mono text-xs ${r.jobs_failed > 0 ? "text-rose-600" : "text-slate-9000"}`}>
                      {formatNum(r.jobs_failed)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatNum(r.profiles)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatNum(r.api_keys)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-emerald-700">
                      {r.revenue > 0 ? formatVnd(r.revenue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.last_activity ? new Date(r.last_activity).toLocaleString("vi-VN") : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {sorted.length > 1 && (
            <tfoot className="bg-white font-semibold">
              <tr className="border-t">
                <td className="px-3 py-2 text-xs uppercase text-slate-500">
                  Tổng ({sorted.length} domain)
                </td>
                <td className="px-3 py-2 font-mono text-xs">{formatNum(totals.users)}</td>
                <td className="px-3 py-2 font-mono text-xs">{formatNum(totals.jobs_total)}</td>
                <td className="px-3 py-2 font-mono text-xs text-cyan-700">{formatNum(totals.jobs_image)}</td>
                <td className="px-3 py-2 font-mono text-xs text-rose-700">{formatNum(totals.jobs_video)}</td>
                <td className={`px-3 py-2 font-mono text-xs ${totals.jobs_failed > 0 ? "text-rose-600" : ""}`}>
                  {formatNum(totals.jobs_failed)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{formatNum(totals.profiles)}</td>
                <td className="px-3 py-2 font-mono text-xs">{formatNum(totals.api_keys)}</td>
                <td className="px-3 py-2 font-mono text-xs text-emerald-700">
                  {totals.revenue > 0 ? formatVnd(totals.revenue) : "—"}
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  k, sk, sd, onClick, children,
}: {
  k: SortKey;
  sk: SortKey;
  sd: "asc" | "desc";
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sk === k;
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100"
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sd === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </span>
    </th>
  );
}
