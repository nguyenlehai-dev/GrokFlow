import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Clock, X } from "lucide-react";
import { promptHistoryService, type PromptHistoryEntry } from "../services/promptHistory.service";

/** Server-synced dropdown of recent prompts. Per-user via JWT auth, so
 *  switching accounts on the same machine never leaks each other's
 *  history. Multi-device (web + desktop) sees the same set. */

/** Called from CreateJobModal right after a successful submit. Fire-and-
 *  forget — UX shouldn't block on history sync. */
export function rememberPrompt(prompt: string, jobType: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  promptHistoryService.add(trimmed, jobType).catch(() => {
    // History sync is best-effort. Server unreachable / 401 / etc.
    // shouldn't break the post-submit flow.
  });
}

export function PromptHistoryDropdown({
  jobType,
  onPick,
}: {
  jobType: string;
  onPick: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery<PromptHistoryEntry[]>({
    queryKey: ["prompt-history", jobType],
    queryFn: () => promptHistoryService.list(jobType || undefined, 20),
    enabled: open,
    // Refetch fresh each time the dropdown opens — invalidation after
    // submit happens via the parent's mutation onSuccess; opening again
    // forces a re-pull in case the user submitted from another tab.
    staleTime: 5_000,
  });

  const removeOne = useMutation({
    mutationFn: (id: string) => promptHistoryService.removeOne(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-history"] }),
  });
  const clearAll = useMutation({
    mutationFn: () => promptHistoryService.clearAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt-history"] });
      setOpen(false);
    },
  });

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
              {isLoading ? "Đang tải…" : `${entries.length} prompt gần đây`}
            </span>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                className="text-xs text-rose-600 hover:underline disabled:opacity-50"
              >
                Xoá tất cả
              </button>
            )}
          </div>
          {!isLoading && entries.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              Chưa có prompt nào. Submit job để lưu lại tự động.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((e) => (
                <li
                  key={e.id}
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
                    onClick={() => removeOne.mutate(e.id)}
                    disabled={removeOne.isPending}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 disabled:opacity-30"
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
