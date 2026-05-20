import { Image as ImageIcon, Video, Sparkles, Scissors, Cpu } from "lucide-react";
import type { Period, AppGroup } from "../models/dashboard";
import { DashboardPeriodTabs } from "./DashboardKpi";
import { formatNum } from "@/core/utils/format";

interface AppStatsProps {
  groups: AppGroup[];
  period: Period;
  onPeriod: (p: Period) => void;
  domains: { id: string; hostname: string }[];
  selectedDomain: string;
  onSelectDomain: (id: string) => void;
  showDomainPicker: boolean;
}

export function DashboardAppStatsSection({
  groups, period, onPeriod, domains, selectedDomain, onSelectDomain, showDomainPicker,
}: AppStatsProps) {
  // Hide empty groups so a tenant with no Flow/Gateway usage doesn't
  // see two ghost columns. Always show at least the first 3 to preserve
  // layout intent when the dashboard is empty (post-deploy / new tenant).
  const visible = groups.filter((g, i) => i < 3 || g.total > 0);
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Thống kê theo App</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân loại {formatNum(grandTotal)} job/request theo nguồn — Grok ảnh, Grok video, Flow video tools, Gateway LLM, API keys.
            {selectedDomain && domains.length > 0 && (
              <>  Đang lọc theo <strong>{domains.find((d) => d.id === selectedDomain)?.hostname ?? "?"}</strong>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showDomainPicker && (
            <select
              className="input text-sm"
              value={selectedDomain}
              onChange={(e) => onSelectDomain(e.target.value)}
            >
              <option value="">Tất cả domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          )}
          <DashboardPeriodTabs value={period} onChange={onPeriod} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {visible.map((g) => (
          <AppGroupCard key={g.code} group={g} grandTotal={grandTotal} />
        ))}
      </div>
    </div>
  );
}

const APP_VISUAL: Record<AppGroup["code"], { icon: typeof ImageIcon; accent: string; bg: string }> = {
  image:    { icon: ImageIcon, accent: "text-cyan-700",    bg: "bg-cyan-50" },
  video:    { icon: Video,     accent: "text-rose-700",    bg: "bg-rose-50" },
  flow:     { icon: Scissors,  accent: "text-violet-700",  bg: "bg-violet-50" },
  gateway:  { icon: Cpu,       accent: "text-indigo-700",  bg: "bg-indigo-50" },
  mini_app: { icon: Sparkles,  accent: "text-amber-700",   bg: "bg-amber-50" },
};

function AppGroupCard({ group, grandTotal }: { group: AppGroup; grandTotal: number }) {
  const visual = APP_VISUAL[group.code];
  const Icon = visual.icon;
  const sharePct = grandTotal > 0 ? Math.round((group.total / grandTotal) * 100) : 0;
  // Show top-bar share of total ONLY for non-trivial groups so the eye is
  // drawn to material contributions, not a single rogue test job.

  const maxInGroup = group.items.length > 0
    ? Math.max(...group.items.map((i) => i.count))
    : 1;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
      <div className={`px-3 py-2 ${visual.bg} border-b border-slate-200`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold flex items-center gap-2 text-sm ${visual.accent}`}>
            <Icon size={16} /> {group.label}
          </h3>
          <span className={`text-xs font-mono font-semibold ${visual.accent}`}>
            {formatNum(group.total)}
            {grandTotal > 0 && (
              <span className="ml-1 text-[10px] font-normal opacity-70">
                ({sharePct}%)
              </span>
            )}
          </span>
        </div>
      </div>
      {group.items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-9000">Chưa có dữ liệu.</p>
      ) : (
        <div className="divide-y divide-slate-200 flex-1">
          {group.items.slice(0, 12).map((item) => {
            // Bar shows the item's count relative to the largest in its group.
            // Helps eye-spot the dominant model/operation per category.
            const barPct = (item.count / maxInGroup) * 100;
            return (
              <div
                key={item.name}
                className="px-3 py-2 hover:bg-white transition text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700 min-w-0">{item.name}</span>
                  <span className={`font-mono font-semibold flex-shrink-0 ${visual.accent}`}>
                    {formatNum(item.count)}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${visual.bg} ${visual.accent}`}
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: "currentColor",
                      opacity: 0.5,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {group.items.length > 12 && (
            <div className="px-3 py-2 text-xs text-slate-500 text-center">
              +{group.items.length - 12} mục khác
            </div>
          )}
        </div>
      )}
    </div>
  );
}
