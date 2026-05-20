import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { GitRepoRow } from "../models/git";
import { gitService } from "../services/git.service";

export function GitRepoEditorModal({
  repo, isCreate, onClose, onDelete,
}: {
  repo: GitRepoRow | null;
  isCreate: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState(repo?.label ?? "");
  const [githubRepo, setGithubRepo] = useState(repo?.github_repo ?? "");
  const [branch, setBranch] = useState(repo?.branch ?? "main");
  const [localPath, setLocalPath] = useState(repo?.local_path ?? "");
  const [composeFile, setComposeFile] = useState(repo?.compose_file ?? "");
  const [envFile, setEnvFile] = useState(repo?.env_file ?? "");
  const [servicesText, setServicesText] = useState((repo?.services ?? []).join(", "));
  const [sortOrder, setSortOrder] = useState(repo?.sort_order ?? 0);

  const save = useMutation({
    mutationFn: async () => {
      const services = servicesText.split(",").map((s) => s.trim()).filter(Boolean);
      const payload = {
        label, github_repo: githubRepo, branch, local_path: localPath,
        compose_file: composeFile || null,
        env_file: envFile || null,
        services, sort_order: sortOrder,
      };
      return isCreate
        ? gitService.createRepo(payload)
        : gitService.updateRepo(repo!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["git-repos"] });
      toast(isCreate ? t("admin.git_repo_created") : t("admin.git_repo_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("admin.git_repo_save_error"), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-3">
        <h2 className="text-lg font-semibold">
          {isCreate ? t("admin.git_repo_modal_create_title") : t("admin.git_repo_modal_edit_title", { label: repo?.label })}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_label")}</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="HostFlow" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_github")}</label>
            <input className="input font-mono" value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_branch")}</label>
            <input className="input font-mono" value={branch}
              onChange={(e) => setBranch(e.target.value)} placeholder="main" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_sort")}</label>
            <input className="input" type="number" value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("admin.git_repo_field_local_path")}</label>
          <input className="input font-mono" value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/opt/hostflow" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_compose")}</label>
            <input className="input font-mono" value={composeFile}
              onChange={(e) => setComposeFile(e.target.value)}
              placeholder={t("admin.git_repo_compose_ph")} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.git_repo_field_env")}</label>
            <input className="input font-mono" value={envFile}
              onChange={(e) => setEnvFile(e.target.value)}
              placeholder={t("admin.git_repo_env_ph")} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("admin.git_repo_field_services")}</label>
          <input className="input font-mono" value={servicesText}
            onChange={(e) => setServicesText(e.target.value)}
            placeholder="backend, frontend, worker" />
          <p className="text-xs text-slate-500 mt-1">
            {t("admin.git_repo_services_hint")}
          </p>
        </div>

        <div className="flex justify-between items-center pt-3 border-t">
          {onDelete && repo ? (
            <button
              onClick={() => onDelete(repo.id)}
              className="btn-ghost text-rose-600 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} /> {t("admin.git_repo_delete_btn")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">{t("admin.git_repo_cancel")}</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !label || !githubRepo || !localPath}
              className="btn-primary"
            >
              {save.isPending
                ? t("admin.git_repo_saving")
                : isCreate
                ? t("admin.git_repo_create")
                : t("admin.git_repo_save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
