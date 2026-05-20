import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Trash2, Search, Loader2, X, User as UserIcon, Bot,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { toolAdminService } from "../services/tool.service";
import type { AdminChatSession } from "../models/types";

/** Admin oversight of every chat session. Lets super_admin read full
 *  transcripts (for moderation/abuse audit) and remove sessions. The
 *  detail view opens as a side drawer rather than a route so the
 *  filtered list state is preserved when toggling between rows. */
export function ToolAdminChatSessionsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<AdminChatSession | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tool-chats", q],
    queryFn: () => toolAdminService.listChatSessions({ q: q.trim() || undefined }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => toolAdminService.deleteChatSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-chats"] });
      toast("Đã xoá session", "success");
      setOpen(null);
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const confirmDelete = (s: AdminChatSession) => {
    if (window.confirm(`Xoá session "${s.title}" của ${s.owner_email ?? "?"}?`)) {
      removeMut.mutate(s.id);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Quản lý Chat Sessions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Xem toàn bộ phiên chat trong hệ thống. Click 1 dòng để xem transcript.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center gap-2">
        <Search size={14} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo title..."
          className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={20} className="animate-spin mx-auto" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Chưa có session nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <tr>
                <th className="text-left font-medium px-3 py-2">Title</th>
                <th className="text-left font-medium px-3 py-2">Owner</th>
                <th className="text-left font-medium px-3 py-2">Model</th>
                <th className="text-right font-medium px-3 py-2">Msgs</th>
                <th className="text-right font-medium px-3 py-2">Tokens</th>
                <th className="text-right font-medium px-3 py-2">Chi phí</th>
                <th className="text-right font-medium px-3 py-2">Cập nhật</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {data!.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                  onClick={() => setOpen(s)}
                >
                  <td className="px-3 py-2 text-slate-800 max-w-[260px] truncate" title={s.title}>
                    {s.title}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{s.owner_email ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs font-mono">{s.model ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">{s.message_count}</td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">{s.total_tokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">
                    ${(s.total_cost_cents / 100).toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">
                    {new Date(s.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDelete(s); }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                      title="Xoá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <TranscriptDrawer
          session={open}
          onClose={() => setOpen(null)}
          onDelete={() => confirmDelete(open)}
        />
      )}
    </div>
  );
}

function TranscriptDrawer({
  session, onClose, onDelete,
}: {
  session: AdminChatSession;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        aria-label="Close"
        className="flex-1"
        onClick={onClose}
      />
      <div className="w-full max-w-xl bg-white shadow-xl flex flex-col">
        <header className="p-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{session.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {session.owner_email ?? "—"} · {session.model ?? "—"} · {session.message_count} tin
            </p>
          </div>
          <button
            onClick={onDelete}
            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
            title="Xoá"
          >
            <Trash2 size={16} />
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {session.messages.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Chưa có tin nhắn.</p>
          ) : session.messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 grid place-items-center flex-shrink-0">
                    <Bot size={14} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    isUser
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 grid place-items-center flex-shrink-0">
                    <UserIcon size={14} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ToolAdminChatSessionsPage;
