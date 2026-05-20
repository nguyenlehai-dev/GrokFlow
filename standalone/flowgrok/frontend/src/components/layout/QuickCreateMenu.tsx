import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sparkles, ImageIcon, Film, Scissors, Cpu, ChevronDown, ExternalLink,
} from "lucide-react";

interface Item {
  labelKey: string;
  descKey: string;
  to: string;
  icon: any;
  tone: "violet" | "fuchsia" | "amber" | "cyan";
  badgeKey?: string;
  publicOk?: boolean;
}

const ITEMS: Item[] = [
  {
    labelKey: "header.qc_image_label",
    descKey: "header.qc_image_desc",
    to: "/try/image",
    icon: ImageIcon,
    tone: "violet",
    badgeKey: "header.quick_create_free_badge",
    publicOk: true,
  },
  {
    labelKey: "header.qc_video_label",
    descKey: "header.qc_video_desc",
    to: "/grok/playground",
    icon: Film,
    tone: "fuchsia",
  },
  {
    labelKey: "header.qc_flow_label",
    descKey: "header.qc_flow_desc",
    to: "/flow",
    icon: Scissors,
    tone: "amber",
  },
  {
    labelKey: "header.qc_gateway_label",
    descKey: "header.qc_gateway_desc",
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        title={t("header.quick_create")}
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">{t("header.quick_create")}</span>
        <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-white shadow-xl ring-1 ring-slate-200 z-40 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-semibold text-slate-700">{t("header.quick_create")}</p>
            <p className="text-[11px] text-slate-500">{t("header.quick_create_subtitle")}</p>
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
                      <p className="text-sm font-semibold text-slate-800 truncate">{t(it.labelKey)}</p>
                      {it.badgeKey && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          {t(it.badgeKey)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{t(it.descKey)}</p>
                  </div>
                  {it.publicOk && (
                    <ExternalLink size={11} className="text-slate-400 mt-1 flex-shrink-0" />
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
