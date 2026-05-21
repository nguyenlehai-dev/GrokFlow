import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import type { Job } from "../models/job";
import { jobsService } from "../services/jobs.service";

export function EditJobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(job.prompt);

  const save = useMutation({
    mutationFn: async () =>
      (await jobsService.update(job.id, { prompt })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast(t("grok.edit_job_toast_success"), "success");
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("grok.edit_job_title", { id: job.id.slice(0, 8) })}</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-slate-500">
          {t("grok.edit_job_hint_prefix")} <strong>{job.status}</strong>. {t("grok.edit_job_hint_suffix")}
        </p>
        <textarea
          className="input min-h-[120px] w-full"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={16000}
        />
        <div className="text-xs text-slate-400 text-right">{prompt.length}/16000</div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <button className="btn-ghost" onClick={onClose}>{t("grok.edit_job_cancel")}</button>
          <button
            className="btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || prompt.trim() === "" || prompt === job.prompt}
          >
            {save.isPending ? t("grok.edit_job_saving") : t("grok.edit_job_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
