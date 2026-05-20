import { useTranslation } from "react-i18next";
import { Check, Search, TrendingUp } from "lucide-react";

export function Analytics() {
  const { t } = useTranslation();
  const bullets = [
    t("landing_v2.analytics_li_1"),
    t("landing_v2.analytics_li_2"),
    t("landing_v2.analytics_li_3"),
  ];
  return (
    <section className="bg-blue-600">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2 md:py-28">
        {/* Left copy */}
        <div className="text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 sm:text-sm">
            {t("landing_v2.why_choose_us")}
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl md:text-5xl">
            {t("landing_v2.analytics_title_a")} <br className="hidden sm:inline" /> {t("landing_v2.analytics_title_b")}
          </h2>
          <p className="mt-4 max-w-md text-sm text-blue-100 sm:mt-5 sm:text-base">
            {t("landing_v2.analytics_body")}
          </p>
          <hr className="my-5 w-full max-w-md border-white/20 sm:my-6" />
          <ul className="space-y-3 text-sm text-white/90">
            {bullets.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15">
                  <Check size={12} className="text-white" />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <button className="mt-7 rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 sm:mt-8">
            {t("landing_v2.learn_more")}
          </button>
        </div>

        {/* Right metrics card */}
        <div className="relative">
          <div className="rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-800">{t("landing_v2.store_metrics")}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{t("landing_v2.store_metrics_sub")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-50">
                  <Search size={14} />
                </button>
                <button className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">M</button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-4">
              <KpiCell label="Bitcoin" value="62%" delta="10.78%" />
              <KpiCell label="Credit" value="12%" delta="1.08%" />
              <KpiCell label="Cash" value="30%" delta="5.90%" />
            </div>

            <BarChart />
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCell({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-800">{value}</span>
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600">
          <TrendingUp size={10} /> {delta}
        </span>
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
// Stacked-bar mock values: each row is one month, three layers (dark→mid→light).
const BARS: [number, number, number][] = [
  [40, 70, 30], [55, 60, 25], [50, 80, 40], [45, 65, 35],
  [60, 110, 50], [55, 90, 45], [80, 130, 65], [70, 140, 70],
  [60, 110, 55], [50, 80, 40],
];

function BarChart() {
  const max = Math.max(...BARS.map((row) => row[0] + row[1] + row[2]));
  return (
    <div className="mt-6 overflow-x-auto">
      <div className="flex h-44 items-end gap-2 sm:h-48 sm:gap-3 min-w-[420px]">
        {/* Y-axis labels */}
        <div className="flex h-full flex-col justify-between pb-5 text-[10px] text-slate-400">
          {[25, 20, 15, 10, 5, 0].map((v) => (
            <span key={v}>${v},000</span>
          ))}
        </div>
        {BARS.map((row, i) => {
          const total = row[0] + row[1] + row[2];
          const h = (total / max) * 100;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full overflow-hidden rounded-md ring-1 ring-slate-100"
                  style={{ height: `${h}%` }}
                >
                  <div className="bg-blue-300" style={{ height: `${(row[2] / total) * 100}%` }} />
                  <div className="bg-blue-500" style={{ height: `${(row[1] / total) * 100}%` }} />
                  <div className="bg-blue-800" style={{ height: `${(row[0] / total) * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] text-slate-400">{MONTHS[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
