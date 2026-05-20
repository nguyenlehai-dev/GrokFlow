import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Send, Loader2, MessageCircle, User as UserIcon,
  Bot, Coins,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { ToolShell } from "../components/ToolShell";
import { chatService } from "../services/tool.service";
import type { ChatSessionDetail } from "../models/types";

const MODELS = [
  { value: "gemini-1.5-flash",         label: "Gemini 1.5 Flash" },
  { value: "gpt-4o-mini",              label: "GPT-4o mini" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
];

export function ToolChatPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Sidebar — past sessions.
  const { data: sessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: chatService.listSessions,
    refetchInterval: 15_000,
  });

  // Detail of the active session — full message history.
  const { data: active } = useQuery<ChatSessionDetail | null>({
    queryKey: ["chat-session", activeId],
    queryFn: () => (activeId ? chatService.getSession(activeId) : Promise.resolve(null)),
    enabled: !!activeId,
  });

  // Auto-scroll to bottom whenever new messages land.
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [active?.messages?.length]);

  const createNew = useMutation({
    mutationFn: () => chatService.createSession({ model }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      setActiveId(s.id);
    },
  });

  const send = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      chatService.send(id, content, model),
    onSuccess: (s) => {
      qc.setQueryData(["chat-session", s.id], s);
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Chat error", "error");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => chatService.deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (activeId) setActiveId(null);
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || send.isPending) return;
    let id = activeId;
    if (!id) {
      const s = await createNew.mutateAsync();
      id = s.id;
    }
    const content = input;
    setInput("");
    send.mutate({ id, content });
  };

  return (
    <ToolShell
      title="AI Chat"
      subtitle="Chat đa lượt với LLM qua gateway"
      action={
        <button
          onClick={() => createNew.mutate()}
          className="tool-btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Chat mới
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-12rem)]">
        {/* Sessions sidebar */}
        <aside className="tool-card overflow-y-auto">
          <div className="p-3 border-b border-violet-500/15 sticky top-0 bg-[rgba(20,16,36,0.92)] backdrop-blur z-10">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="tool-input text-xs"
            >
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <ul className="p-2 space-y-1">
            {(sessions ?? []).map((s) => (
              <li
                key={s.id}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition ${
                  s.id === activeId
                    ? "bg-violet-500/20 ring-1 ring-violet-400/40"
                    : "hover:bg-violet-500/10"
                }`}
                onClick={() => setActiveId(s.id)}
              >
                <MessageCircle size={13} className="text-violet-300 flex-shrink-0" />
                <span className="text-xs text-violet-100 truncate flex-1">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); remove.mutate(s.id); }}
                  className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300"
                  title="Xoá"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
            {(sessions ?? []).length === 0 && (
              <li className="text-xs text-violet-200/40 px-2 py-4 text-center">
                Chưa có session nào
              </li>
            )}
          </ul>
        </aside>

        {/* Chat area */}
        <main className="tool-card flex flex-col overflow-hidden">
          <div
            ref={messagesRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {!active ? (
              <div className="h-full flex items-center justify-center text-violet-200/50 text-sm">
                Chọn 1 session hoặc bấm "Chat mới" để bắt đầu
              </div>
            ) : active.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-violet-200/50 text-sm">
                <Bot size={28} className="mb-2 text-violet-400" />
                Gõ tin nhắn đầu tiên bên dưới
              </div>
            ) : (
              active.messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} content={m.content} />
              ))
            )}
            {send.isPending && (
              <div className="flex items-center gap-2 text-violet-300/70 text-xs">
                <Loader2 size={12} className="animate-spin" />
                AI đang suy nghĩ…
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={onSubmit} className="border-t border-violet-500/15 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi gì đó..."
              className="tool-input flex-1"
              disabled={send.isPending}
            />
            <button
              type="submit"
              disabled={!input.trim() || send.isPending}
              className="tool-btn-primary inline-flex items-center gap-1.5"
            >
              {send.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Gửi
            </button>
          </form>

          {active && (
            <div className="px-3 pb-2 text-[10px] text-violet-300/50 flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Coins size={10} /> {active.total_tokens} tokens
              </span>
              <span>${(active.total_cost_cents / 100).toFixed(4)}</span>
              <span>· {active.model}</span>
            </div>
          )}
        </main>
      </div>
    </ToolShell>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <span
        className={`w-8 h-8 rounded-full flex-shrink-0 grid place-items-center ${
          isUser
            ? "bg-gradient-to-br from-violet-600 to-fuchsia-600"
            : "bg-slate-700/60 ring-1 ring-violet-500/30"
        }`}
      >
        {isUser ? <UserIcon size={14} className="text-white" /> : <Bot size={14} className="text-violet-300" />}
      </span>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-gradient-to-br from-violet-600/90 to-fuchsia-600/90 text-white"
            : "bg-slate-800/70 ring-1 ring-violet-500/15 text-violet-50"
        }`}
      >
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}

export default ToolChatPage;
