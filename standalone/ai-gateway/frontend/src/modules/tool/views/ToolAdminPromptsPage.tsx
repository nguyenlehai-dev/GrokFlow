import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Search, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { toolAdminService } from "../services/tool.service";

const SCOPES = [
  { v: "all",    label: "Tất cả" },
  { v: "system", label: "System" },
  { v: "domain", label: "Domain" },
  { v: "user",   label: "User" },
];

const CATEGORIES = [
  { v: "all",   label: "Mọi loại" },
  { v: "text",  label: "Văn bản" },
  { v: "image", label: "Hình ảnh" },
  { v: "video", label: "Video" },
  { v: "code",  label: "Code" },
  { v: "other", label: "Khác" },
];

/** Admin oversight of every prompt template in the database. Filter by
 *  scope/category/user/email, bulk delete with a single click. Reuses the
 *  read endpoints with the SuperAdmin dep so listing never silently
 *  drops rows due to user-visibility rules. */
export function ToolAdminPromptsPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState("all");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tool-prompts", scope, category, q],
    queryFn: () => toolAdminService.listPrompts({
      scope: scope === "all" ? undefined : scope,
      category: category === "all" ? undefined : category,
      q: q.trim() || undefined,
    }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => toolAdminService.deletePrompt(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-prompts"] });
      toast("Đã xoá prompt", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const confirmDelete = (id: string, title: string) => {
    if (window.confirm(`Xoá prompt "${title}"?`)) removeMut.mutate(id);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Quản lý Prompt</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Toàn bộ template prompt trong hệ thống — system, domain, và user-level.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo title..."
            className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="px-2 py-1 text-sm border border-slate-200 rounded-md bg-white"
        >
          {SCOPES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-2 py-1 text-sm border border-slate-200 rounded-md bg-white"
        >
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={20} className="animate-spin mx-auto" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Không có prompt nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <tr>
                <th className="text-left font-medium px-3 py-2">Title</th>
                <th className="text-left font-medium px-3 py-2">Scope</th>
                <th className="text-left font-medium px-3 py-2">Owner</th>
                <th className="text-left font-medium px-3 py-2">Category</th>
                <th className="text-right font-medium px-3 py-2">Lượt dùng</th>
                <th className="text-right font-medium px-3 py-2">Tạo lúc</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {data!.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-800 max-w-[280px] truncate" title={p.title}>
                    {p.title}
                  </td>
                  <td className="px-3 py-2">
                    <ScopePill scope={p.scope} />
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {p.scope === "system" ? "—" : (p.owner_email ?? `domain:${p.domain_id?.slice(0,8)}`)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{p.category}</td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">{p.usage_count}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => confirmDelete(p.id, p.title)}
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
    </div>
  );
}

function ScopePill({ scope }: { scope: string }) {
  const map: Record<string, string> = {
    system: "bg-amber-100 text-amber-700 ring-amber-200",
    domain: "bg-blue-100 text-blue-700 ring-blue-200",
    user:   "bg-emerald-100 text-emerald-700 ring-emerald-200",
  };
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${map[scope] ?? map.user}`}>
      {scope}
    </span>
  );
}

export default ToolAdminPromptsPage;
