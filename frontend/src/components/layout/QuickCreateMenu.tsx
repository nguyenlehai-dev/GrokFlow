import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, ImageIcon, Film, Scissors, Cpu, ChevronDown, ExternalLink,
} from "lucide-react";

/** Header dropdown with quick-create shortcuts.
 *  - Anonymous-friendly entries link to public /try/* pages
 *  - Auth-only entries link straight to the playground inside the app
 *  Closes on outside click and on Esc. */

interface Item {
  label: string;
  desc: string;
  to: string;
  icon: any;
  tone: "violet" | "fuchsia" | "amber" | "cyan";
  badge?: string;
  /** When true, the link is to a public page that works without auth. */
  publicOk?: boolean;
}

const ITEMS: Item[] = [
  {
    label: "Tạo ảnh — Grok Image",
    desc: "Generate ảnh AI từ prompt. Anonymous được 2 ảnh/ngày.",
    to: "/try/image",
    icon: ImageIcon,
    tone: "violet",
    badge: "Free trial",
    publicOk: true,
  },
  {
    label: "Tạo video — Grok Video",
    desc: "Render video từ prompt. Cần plan Basic trở lên.",
    to: "/grok/playground",
    icon: Film,
    tone: "fuchsia",
  },
  {
    label: "Cắt / Gộp video — Flow",
    desc: "Cut, merge, resize, extract audio. Upload file của bạn.",
    to: "/flow",
    icon: Scissors,
    tone: "amber",
  },
  {
    label: "Gateway Playground — LLM API",
    desc: "Test execute call qua LLM gateway (OpenAI / Gemini / ...).",
    to: "/gateway/playground",
    icon: Cpu,
    tone: "cyan",
  },
];

const TONE_BG: Record<string, string> = {
  violet:  "bg-violet-50 text-violet-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
  amber:   "bg-amber-50 text-amber-600",
  cyan:    "bg-cyan-50 text-cyan-600",
};

export function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 text-sm font-medium text-violet-700"
        title="Tạo nhanh"
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">Tạo nhanh</span>
        <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-white shadow-xl ring-1 ring-slate-200 z-40 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-700">Tạo nhanh</p>
            <p className="text-[11px] text-slate-500">Chọn loại nội dung — mở playground tương ứng</p>
          </div>
          <ul>
            {ITEMS.map((it) => (
              <li key={it.to}>
                <Link
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className="group flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition"
                >
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${TONE_BG[it.tone]}`}>
                    <it.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-800 truncate">{it.label}</p>
                      {it.badge && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          {it.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{it.desc}</p>
                  </div>
                  {it.publicOk && (
                    <ExternalLink size={11} className="text-slate-300 mt-1 flex-shrink-0" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
