import { useEffect, useState } from "react";
import { ChevronDown, Clock, X } from "lucide-react";

const STORAGE_KEY = "grok:prompt-history";
const MAX_ITEMS = 20;

type Entry = { prompt: string; ts: number; jobType: string };

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function save(entries: Entry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
  } catch {
    // Quota exceeded or disabled — silently drop. History is not critical.
  }
}

export function rememberPrompt(prompt: string, jobType: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const existing = load().filter((e) => e.prompt !== trimmed);
  save([{ prompt: trimmed, ts: Date.now(), jobType }, ...existing]);
}

export function PromptHistoryDropdown({
  jobType,
  onPick,
}: {
  jobType: string;
  onPick: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (open) setEntries(load());
  }, [open]);

  const filtered = entries.filter((e) => !jobType || e.jobType === jobType);

  const remove = (prompt: string) => {
    const next = load().filter((e) => e.prompt !== prompt);
    save(next);
    setEntries(next);
  };

  const clearAll = () => {
    save([]);
    setEntries([]);
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100"
        title="Prompt gần đây"
      >
        <Clock size={12} /> Lịch sử <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-[480px] max-w-[80vw] right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-[360px] overflow-auto"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 sticky top-0 bg-white">
            <span className="text-xs font-medium text-slate-600">
              {filtered.length} prompt gần đây
            </span>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-rose-600 hover:underline"
              >
                Xoá tất cả
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              Chưa có prompt nào. Submit job để lưu lại tự động.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <li
                  key={e.ts}
                  className="px-3 py-2 hover:bg-slate-50 flex items-start gap-2 group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(e.prompt);
                      setOpen(false);
                    }}
                    className="flex-1 text-left text-xs text-slate-700 line-clamp-2"
                  >
                    {e.prompt}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e.prompt)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600"
                    title="Xoá khỏi lịch sử"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
