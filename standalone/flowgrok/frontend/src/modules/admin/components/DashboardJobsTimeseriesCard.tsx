import type { JobTimePoint } from "../models/dashboard";
import { formatNum } from "@/core/utils/format";

export function DashboardJobsTimeseriesCard({ data }: { data: JobTimePoint[] }) {
  return (
    <div className="card">
      <h3 className="font-semibold">Jobs 30 ngày gần nhất</h3>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-9000">
          Chưa có job.
        </div>
      ) : (
        <BarChart data={data} />
      )}
    </div>
  );
}

function BarChart({ data }: { data: JobTimePoint[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1 mt-3">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div
              key={d.day}
              className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition relative group"
              style={{ height: `${h}%`, minHeight: "1px" }}
              title={`${d.day}: ${formatNum(d.count)} jobs`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-9000 font-mono">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}
