// ─── History (anonymous, localStorage) ────────────────────────────────────
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";

import type { HistoryItem } from "../models/try-image";

export function TryImageHistorySection({
  items, onPick, onClear,
}: { items: HistoryItem[]; onPick: (it: HistoryItem) => void; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2">
          <History size={16} className="text-cyan-600" /> {t("landing.try_history_title")}
        </h3>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-rose-600">
          {t("landing.try_history_clear")}
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {items.map((it) => (
          <button
            key={it.job_id}
            onClick={() => onPick(it)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 hover:ring-2 hover:ring-violet-500 transition"
            title={it.prompt}
          >
            <img src={it.result_url} alt={it.prompt} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition">
              <p className="text-[10px] text-white truncate">{it.prompt}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        {t("landing.try_history_footer")}
      </p>
    </div>
  );
}
