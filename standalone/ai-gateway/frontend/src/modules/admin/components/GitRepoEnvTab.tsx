import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation, Trans } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import { gitService } from "../services/git.service";

export function GitRepoEnvTab({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["git-env", repoId],
    queryFn: () => gitService.getEnv(repoId),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (content: string) => gitService.saveEnv(repoId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["git-env", repoId] });
      setDraft(null);
      toast(t("admin.git_env_saved"), "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("admin.git_env_save_error"), "error"),
  });

  if (isLoading || !data) return <p className="text-slate-500">{t("admin.git_env_loading")}</p>;
  const current = draft ?? data.env;
  return (
    <section className="card space-y-3">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">{t("admin.git_env_title")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <Trans
              i18nKey="admin.git_env_help"
              values={{ path: data.path }}
              components={{
                code: <code className="font-mono" />,
                strong: <strong />,
              }}
            />
          </p>
        </div>
        {draft !== null && (
          <button
            className="btn-ghost text-xs"
            onClick={() => setDraft(null)}
          >
            {t("admin.git_env_cancel_changes")}
          </button>
        )}
      </header>
      <textarea
        className="w-full h-96 font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded border border-slate-700 outline-none focus:border-violet-500"
        value={current}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">
          {t("admin.git_env_lines_with_value", {
            value: current.split("\n").filter((l) => l && !l.startsWith("#")).length,
          })}
        </span>
        <button
          className="btn-primary"
          disabled={draft === null || save.isPending}
          onClick={() => draft !== null && save.mutate(draft)}
        >
          {save.isPending ? t("admin.git_env_saving") : t("admin.git_env_save")}
        </button>
      </div>
    </section>
  );
}
