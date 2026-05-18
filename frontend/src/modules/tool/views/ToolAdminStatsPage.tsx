import { useQuery } from "@tanstack/react-query";
import {
  FileText, MessageCircle, Hash, Coins, Loader2,
} from "lucide-react";

import { toolAdminService } from "../services/tool.service";

/** Admin oversight dashboard — aggregate counters for the Tool module.
 *  Stays on the standard admin skin (light) rather than the VIP dark
 *  purple, so it reads as a management view, not a creator view. */
export function ToolAdminStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-tool-stats"],
    queryFn: () => toolAdminService.stats(),
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Loader2 size={20} className="animate-spin mx-auto" />
      </div>
    );
  }
  if (!data) return null;

  const cards = [
    { icon: FileText, label: "Tổng prompt", value: data.prompt_count_total, hint:
      `${data.prompt_count_system} system · ${data.prompt_count_domain} domain · ${data.prompt_count_user} user` },
    { icon: MessageCircle, label: "Chat sessions", value: data.chat_session_count, hint:
      `${data.chat_message_count} tin nhắn` },
    { icon: Hash, label: "Token tổng", value: data.chat_tokens_total.toLocaleString(), hint: "Tích lũy mọi user" },
    { icon: Coins, label: "Chi phí (USD)", value: (data.chat_cost_cents_total / 100).toFixed(2), hint: "Ước tính theo pool" },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Tổng quan Tool</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Thống kê toàn hệ thống về prompt library + chat sessions.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider">
                <Icon size={14} /> {c.label}
              </div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{c.value}</div>
              <div className="text-[11px] text-slate-400 mt-1">{c.hint}</div>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <h2 className="font-semibold text-slate-800 mb-2 text-sm">
          Top 10 prompt được dùng nhiều nhất
        </h2>
        {data.top_prompts.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">Chưa có dữ liệu sử dụng.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase tracking-wider">
              <tr className="border-b border-slate-100">
                <th className="text-left font-medium py-2">Tiêu đề</th>
                <th className="text-left font-medium py-2">Scope</th>
                <th className="text-left font-medium py-2">Category</th>
                <th className="text-right font-medium py-2">Lượt dùng</th>
              </tr>
            </thead>
            <tbody>
              {data.top_prompts.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700">{p.title}</td>
                  <td className="py-2 text-slate-500">{p.scope}</td>
                  <td className="py-2 text-slate-500">{p.category}</td>
                  <td className="py-2 text-right text-slate-700 font-mono">{p.usage_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default ToolAdminStatsPage;
