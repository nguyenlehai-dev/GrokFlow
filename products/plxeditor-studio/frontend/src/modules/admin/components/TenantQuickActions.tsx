import { Link } from "react-router-dom";
import {
  Layers, Workflow, Activity, FileText, Key, ScrollText, Settings,
  Scissors, Cpu, ArrowRight,
} from "lucide-react";

// Map a path → which card to show. We render only paths the domain allows.
const QUICK_CARDS: {
  path: string;
  label: string;
  desc: string;
  icon: React.ComponentType<any>;
  tone: string;
}[] = [
  // Grok
  { path: "/profiles", label: "Profiles", desc: "Browser sessions để chạy Grok", icon: Layers, tone: "violet" },
  { path: "/jobs", label: "Jobs", desc: "Lịch sử image/video", icon: Workflow, tone: "violet" },
  { path: "/grok/playground", label: "Playground", desc: "Submit job qua API key", icon: Activity, tone: "violet" },
  { path: "/api-docs", label: "API Docs", desc: "Reference cho client ngoài", icon: FileText, tone: "slate" },
  // Gateway
  { path: "/gateway", label: "Gateway", desc: "Quản lý vendor, pool, key", icon: Cpu, tone: "blue" },
  { path: "/gateway/playground", label: "Gateway Playground", desc: "Thử execute trực tiếp", icon: Activity, tone: "blue" },
  { path: "/gateway/requests", label: "Gateway Requests", desc: "Lịch sử request", icon: Workflow, tone: "blue" },
  { path: "/gateway/docs", label: "Gateway Docs", desc: "API reference", icon: FileText, tone: "slate" },
  // Flow
  { path: "/flow", label: "Flow Tools", desc: "Cut / Merge / Resize video", icon: Scissors, tone: "fuchsia" },
  { path: "/flow/requests", label: "Flow Requests", desc: "Job lifecycle", icon: Workflow, tone: "fuchsia" },
  { path: "/flow/docs", label: "Flow Docs", desc: "API reference", icon: FileText, tone: "slate" },
  // Core
  { path: "/api-keys", label: "API Keys", desc: "Tạo / thu hồi key", icon: Key, tone: "amber" },
  { path: "/audit-logs", label: "Audit Log", desc: "Hoạt động trong domain", icon: ScrollText, tone: "slate" },
  { path: "/settings", label: "Settings", desc: "Ngôn ngữ, thông báo", icon: Settings, tone: "slate" },
];

const TONE_BG: Record<string, string> = {
  violet:  "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100",
  blue:    "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 hover:bg-fuchsia-100",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100",
  slate:   "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100",
};

export function TenantQuickActions({ allowed }: { allowed: string[] }) {
  const allowedSet = new Set(allowed);
  // Match a card if its exact path OR its prefix is allowed (e.g. /flow
  // grants /flow/requests as well — but we want explicit cards anyway).
  const visible = QUICK_CARDS.filter((c) =>
    allowedSet.has(c.path) || allowed.some((p) => c.path.startsWith(p + "/")),
  );
  if (visible.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Truy cập nhanh</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <Link
            key={c.path}
            to={c.path}
            className={`group rounded-lg p-4 ring-1 transition flex items-start gap-3 ${TONE_BG[c.tone]}`}
          >
            <c.icon size={22} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{c.label}</p>
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition" />
              </div>
              <p className="text-xs opacity-80 mt-0.5">{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
