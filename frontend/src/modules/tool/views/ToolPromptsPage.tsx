import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Copy, Trash2, Pencil, Tag, Search, Globe, User as UserIcon,
  Building2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { ToolShell } from "../components/ToolShell";
import { promptsService } from "../services/tool.service";
import type { PromptCategory, PromptTemplate } from "../models/types";

const CATEGORIES: { v: PromptCategory | "all"; label: string }[] = [
  { v: "all", label: "Tất cả" },
  { v: "text", label: "Văn bản" },
  { v: "image", label: "Hình ảnh" },
  { v: "video", label: "Video" },
  { v: "code", label: "Code" },
  { v: "other", label: "Khác" },
];

export function ToolPromptsPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<PromptCategory | "all">("all");
  const [scope, setScope] = useState<"all" | "system" | "domain" | "user">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tool-prompts", category, scope, q],
    queryFn: () => promptsService.list({
      category: category === "all" ? undefined : category,
      scope: scope === "all" ? undefined : scope,
      q: q.trim() || undefined,
    }),
  });

  const removePrompt = useMutation({
    mutationFn: (id: string) => promptsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tool-prompts"] });
      toast("Đã xoá", "success");
    },
  });

  const copy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast("Đã copy prompt", "success");
  };

  return (
    <ToolShell
      title="Mẫu Prompt"
      subtitle="Thư viện prompt: system (chung) · domain (tenant) · user (riêng)"
      action={
        <button
          onClick={() => setCreating(true)}
          className="tool-btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo prompt
        </button>
      }
    >
      {/* Filters */}
      <div className="tool-card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-violet-300 flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo title..."
            className="tool-input"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PromptCategory | "all")}
          className="tool-input w-auto"
        >
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
        </select>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "all" | "system" | "domain" | "user")}
          className="tool-input w-auto"
        >
          <option value="all">All scope</option>
          <option value="system">System</option>
          <option value="domain">Domain</option>
          <option value="user">Của tôi</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center text-violet-200/60 py-12">Đang tải…</div>
      ) : (data ?? []).length === 0 ? (
        <div className="tool-card p-8 text-center text-violet-200/60 text-sm">
          Chưa có prompt nào. Bấm "Tạo prompt" để thêm.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data!.map((p) => (
            <div key={p.id} className="tool-card tool-card-hover p-4 flex flex-col">
              <header className="flex items-start gap-2 mb-2">
                <ScopeBadge scope={p.scope} />
                <h3 className="font-semibold text-white flex-1 truncate" title={p.title}>
                  {p.title}
                </h3>
              </header>
              <p className="text-xs text-violet-200/70 line-clamp-3 mb-3 min-h-[3rem]">
                {p.content}
              </p>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.tags.slice(0, 4).map((t) => (
                    <span key={t} className="inline-flex items-center gap-0.5 text-[10px] bg-violet-500/15 text-violet-200 px-1.5 py-0.5 rounded">
                      <Tag size={9} /> {t}
                    </span>
                  ))}
                </div>
              )}
              <footer className="mt-auto flex items-center gap-2 pt-2 border-t border-violet-500/10">
                <span className="text-[10px] text-violet-300/60 mr-auto">
                  Dùng {p.usage_count} lần · {p.category}
                </span>
                <button
                  onClick={() => copy(p.content)}
                  className="p-1.5 rounded text-violet-300 hover:bg-violet-500/15"
                  title="Copy nội dung"
                >
                  <Copy size={12} />
                </button>
                {(p.user_id === me?.id || me?.role === "super_admin") && (
                  <>
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 rounded text-violet-300 hover:bg-violet-500/15"
                      title="Sửa"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => removePrompt.mutate(p.id)}
                      className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15"
                      title="Xoá"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </footer>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PromptEditorModal
          prompt={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </ToolShell>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const map: Record<string, { icon: typeof Globe; cls: string; label: string }> = {
    system: { icon: Globe, cls: "bg-amber-500/15 text-amber-300 ring-amber-400/30", label: "System" },
    domain: { icon: Building2, cls: "bg-blue-500/15 text-blue-300 ring-blue-400/30", label: "Domain" },
    user:   { icon: UserIcon, cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", label: "Của tôi" },
  };
  const info = map[scope] ?? map.user;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${info.cls}`}>
      <Icon size={9} /> {info.label}
    </span>
  );
}

function PromptEditorModal({
  prompt, onClose,
}: { prompt: PromptTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [category, setCategory] = useState<PromptCategory>(prompt?.category ?? "text");
  const [tagsStr, setTagsStr] = useState((prompt?.tags ?? []).join(", "));
  const [scopeMode, setScopeMode] = useState<"user" | "domain" | "system">(
    prompt?.scope ?? "user",
  );
  const [isPublic, setIsPublic] = useState(prompt?.is_public ?? false);

  const save = useMutation({
    mutationFn: () => {
      const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
      const base = { title, content, category, tags, is_public: isPublic };
      if (prompt) {
        return promptsService.update(prompt.id, base);
      }
      const payload: Record<string, unknown> = { ...base };
      if (scopeMode === "system") payload.system = true;
      if (scopeMode === "domain") payload.domain_id = me?.domain_id;
      return promptsService.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tool-prompts"] });
      toast(prompt ? "Đã lưu" : "Đã tạo", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="tool-card w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-semibold text-white">
          {prompt ? "Sửa prompt" : "Tạo prompt mới"}
        </h3>
        <div>
          <label className="text-xs text-violet-200/70">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="tool-input mt-1" />
        </div>
        <div>
          <label className="text-xs text-violet-200/70">Nội dung</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="tool-input mt-1 min-h-[140px] font-mono text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-violet-200/70">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as PromptCategory)} className="tool-input mt-1">
              {CATEGORIES.filter((c) => c.v !== "all").map((c) => (
                <option key={c.v} value={c.v}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-violet-200/70">Tags (cách nhau bởi dấu phẩy)</label>
            <input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="cinematic, realistic, ..."
              className="tool-input mt-1"
            />
          </div>
        </div>
        {!prompt && (
          <div>
            <label className="text-xs text-violet-200/70">Scope</label>
            <select
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as "user" | "domain" | "system")}
              className="tool-input mt-1"
            >
              <option value="user">Của riêng tôi (mặc định)</option>
              {(me?.role === "admin" || me?.role === "super_admin") && (
                <option value="domain">Domain (chia sẻ trong tenant)</option>
              )}
              {me?.role === "super_admin" && (
                <option value="system">System (chia sẻ toàn hệ)</option>
              )}
            </select>
          </div>
        )}
        {scopeMode === "domain" && (
          <label className="flex items-center gap-2 text-xs text-violet-200">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Cho user khác trong domain xem
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-violet-200 hover:text-white">
            Hủy
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!title.trim() || !content.trim() || save.isPending}
            className="tool-btn-primary"
          >
            {save.isPending ? "Đang lưu..." : prompt ? "Lưu" : "Tạo"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ToolPromptsPage;
