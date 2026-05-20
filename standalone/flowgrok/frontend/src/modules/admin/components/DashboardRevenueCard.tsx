import { TrendingUp } from "lucide-react";
import type { RevenuePoint } from "../models/dashboard";
import { formatVnd } from "@/core/utils/format";

export function DashboardRevenueCard({ data, total }: { data: RevenuePoint[]; total: number }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" /> Doanh thu 12 tháng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Tổng đã thu: {formatVnd(total)}</p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-9000">
          Chưa có thanh toán nào.
        </div>
      ) : (
        <LineChart data={data} />
      )}
    </div>
  );
}

function LineChart({ data }: { data: RevenuePoint[] }) {
  const W = 600, H = 160, PAD = 24;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const min = 0;
  const xStep = (W - PAD * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = PAD + i * xStep;
    const y = H - PAD - ((d.amount - min) / (max - min)) * (H - PAD * 2);
    return { x, y, ...d };
  });
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
        <defs>
          <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rev-grad)" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
        {points.map((p) => (
          <g key={p.month}>
            <circle cx={p.x} cy={p.y} r="3" fill="#10b981" />
            <title>{p.month}: {formatVnd(p.amount)}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-9000 font-mono px-2">
        {points.length > 0 && (
          <>
            <span>{points[0].month}</span>
            {points.length > 2 && <span>{points[Math.floor(points.length / 2)].month}</span>}
            <span>{points[points.length - 1].month}</span>
          </>
        )}
      </div>
    </div>
  );
}
