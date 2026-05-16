import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, Plus, Pencil } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { AdminGuard } from "../components/AdminGuard";
import type { GitRepoRow } from "../models/git";
import { gitService } from "../services/git.service";
import { GitRepoPanel } from "../components/GitRepoPanel";
import { GitRepoEditorModal } from "../components/GitRepoEditorModal";

export function AdminGitPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<GitRepoRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: repos, isLoading } = useQuery({
    queryKey: ["git-repos"],
    queryFn: () => gitService.listRepos(),
  });

  // Auto-select first repo when loaded
  useEffect(() => {
    if (repos && repos.length > 0 && !activeId) {
      setActiveId(repos[0].id);
    }
  }, [repos, activeId]);

  const removeRepo = useMutation({
    mutationFn: (id: string) => gitService.removeRepo(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["git-repos"] });
      if (activeId === id) setActiveId(null);
      toast(t("admin.git_repo_deleted"), "success");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">{t("admin.git_repo_page_title")}</h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> {t("admin.git_repo_create_btn")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("admin.git_repo_loading")}</p>
      ) : !repos || repos.length === 0 ? (
        <div className="card text-center py-8 text-slate-500">
          {t("admin.git_repo_empty")}
        </div>
      ) : (
        <>
          {/* Tab strip */}
          <div className="flex gap-1 border-b border-slate-200 flex-wrap">
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 transition group ${
                  activeId === r.id
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <GitBranch size={14} />
                {r.label}
                <span
                  className="ml-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(r);
                  }}
                  title={t("admin.git_repo_edit_title")}
                >
                  <Pencil size={12} />
                </span>
              </button>
            ))}
          </div>

          {activeId && (
            <GitRepoPanel repoId={activeId} key={activeId} />
          )}
        </>
      )}

      {(editing || creating) && (
        <GitRepoEditorModal
          repo={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onDelete={editing ? (id) => {
            if (confirm(t("admin.git_repo_delete_confirm", { label: editing.label }))) {
              removeRepo.mutate(id);
              setEditing(null);
            }
          } : undefined}
        />
      )}
    </div>
  );
}
