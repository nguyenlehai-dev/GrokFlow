import { useTranslation } from "react-i18next";
import {
  ChevronDown, Search, Filter, Play, Upload, FileText, Sparkles,
} from "lucide-react";

export function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-12 text-center sm:px-6 sm:pt-16 md:pt-24">
        <h1 className="bg-gradient-to-r from-sky-500 via-blue-500 to-blue-700 bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent sm:text-5xl md:text-7xl">
          {t("landing_v2.hero_title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:mt-5 sm:text-base md:text-lg">
          {t("landing_v2.hero_subtitle")}
        </p>

        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-slate-100/80 p-3 shadow-sm ring-1 ring-slate-200/60 sm:mt-10 sm:flex-row sm:items-center sm:gap-3">
          <SearchSelect label={t("landing_v2.hero_task")} placeholder={t("landing_v2.hero_select")} />
          <div className="hidden h-10 w-px bg-slate-200 sm:block" />
          <SearchSelect label={t("landing_v2.hero_domain")} placeholder={t("landing_v2.hero_select")} />
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto">
            <Search size={16} /> {t("landing_v2.hero_search")}
          </button>
        </div>
      </div>

      {/* Dashboard mockup with floating overlays.
       *  `z-10` keeps the mockup above the absolute sky-blue backdrop
       *  rendered later in the DOM (which sits at z-0).
       */}
      <div className="relative z-10 mx-auto mt-10 max-w-6xl px-4 pb-16 sm:mt-16 sm:px-6 sm:pb-24">
        <DashboardMockup />

        <FloatOverlay
          className="absolute -left-2 top-1/3 hidden -translate-y-1/2 md:block"
          icon={<Upload size={16} />}
          title="Upload Financial Documents"
          body="Browse and choose the files you want to upload from your computer"
        />

        <FloatOverlay
          className="absolute -right-2 top-1/4 hidden md:block"
          icon={<FileText size={16} className="text-blue-500" />}
          title="Downloading Report"
          progress={81}
        />

        <FloatOverlay
          className="absolute -right-4 top-1/2 hidden -translate-y-1/2 md:block"
          icon={<Sparkles size={16} className="text-blue-500" />}
          title="Account Summary"
          body="Lorem ipsum dolor sit…"
        />

        {/* Center play button */}
        <button
          aria-label="Play demo"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid h-16 w-16 place-items-center rounded-full bg-slate-900 text-white shadow-2xl ring-4 ring-white/40 transition hover:scale-105"
        >
          <Play size={24} className="ml-1 fill-current" />
        </button>
      </div>

      {/* Soft blue "floor" behind the dashboard mockup — matches the
       *  Figma reference where the lower half of the hero fades into a
       *  sky-blue wash. Stops at the next section seam so the rhythm
       *  white → blue → slate-50 stays visible.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[55%] bg-gradient-to-b from-transparent via-sky-100/70 to-sky-200/80"
      />
    </section>
  );
}

function SearchSelect({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <button className="flex flex-1 items-center justify-between rounded-xl bg-white px-4 py-3 text-left transition hover:bg-slate-50">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-800">{label}</div>
        <div className="truncate text-xs text-slate-400">{placeholder}</div>
      </div>
      <ChevronDown size={16} className="ml-2 text-slate-400" />
    </button>
  );
}

function FloatOverlay({
  className, icon, title, body, progress,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  body?: string;
  progress?: number;
}) {
  return (
    <div className={`w-64 rounded-xl border border-slate-100 bg-white p-4 shadow-2xl ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
            {progress != null && (
              <span className="text-xs font-medium text-slate-500">{progress}%</span>
            )}
          </div>
          {body && <p className="mt-1 text-xs text-slate-500">{body}</p>}
          {progress != null && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex flex-col items-stretch gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-800 sm:text-lg">Billing</h3>
          <p className="mt-0.5 text-xs text-slate-500">Manage your billing and payment details</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white sm:flex-none">+ Add</button>
          <button className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 sm:flex-none">
            Download video and img
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-100 px-5">
        {["Overview", "Segments", "Dashboard"].map((t, i) => (
          <button
            key={t}
            className={`relative -mb-px py-3 text-sm ${i === 0 ? "text-slate-800" : "text-slate-500"}`}
          >
            {t}
            {i === 0 && <span className="absolute inset-x-0 -bottom-0 h-0.5 bg-blue-600" />}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-400">
          <Search size={12} /> Search by invoice number, date, amount…
        </div>
        <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
          <Filter size={12} /> Filter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-y border-slate-100 bg-slate-50/50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-2">Job ID</th>
              <th>Prompt</th>
              <th>Billing Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {INVOICE_ROWS.map((r) => (
              <tr key={r.no} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2.5 text-slate-700">{r.no}</td>
                <td className="max-w-[260px] truncate text-slate-700">{r.vendor}</td>
                <td className="text-slate-500">{r.date}</td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.status === "Paid" ? "text-emerald-600" : "text-rose-600"
                  }`}>{r.status}</span>
                </td>
                <td className="pr-5 text-right">
                  <button
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white"
                    aria-label="Play preview"
                  >
                    <Play size={10} className="fill-current" /> Play
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const INVOICE_ROWS = [
  { no: "job_5149abf6", vendor: "A neon city at night, ultra-realistic", date: "21/11/21", status: "Paid" },
  { no: "job_a8b134e2", vendor: "Cinematic studio portrait of an astronaut", date: "5/11/15", status: "Paid" },
  { no: "job_c44d09a1", vendor: "Top-down isometric cafe, Studio Ghibli", date: "9/18/16", status: "Paid" },
  { no: "job_5d5fe2b8", vendor: "Ocean waves at sunset, 4K cinematic", date: "21/11/12", status: "Paid" },
  { no: "job_9f81e7cc", vendor: "Mountain hiker reaches the summit", date: "5/19/12", status: "Unpaid" },
  { no: "job_2ea0c41f", vendor: "Macro shot of dew on a leaf, golden hour", date: "11/30/12", status: "Unpaid" },
];
