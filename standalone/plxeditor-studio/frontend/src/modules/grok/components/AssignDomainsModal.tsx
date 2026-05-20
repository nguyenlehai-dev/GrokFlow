import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, Globe, Save } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import type { Domain } from "../models/domain";
import type { Project } from "../models/project";
import { projectsService } from "../services/projects.service";

export function AssignDomainsModal({
  project, domains, onClose,
}: { project: Project; domains: Domain[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: current, isLoading } = useQuery({
    queryKey: ["grok-project-domains", project.id],
    queryFn: () => projectsService.getDomains(project.id),
  });
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const effective = selected ?? new Set(current?.domain_ids ?? []);

  const save = useMutation({
    mutationFn: () =>
      projectsService.setDomains(project.id, Array.from(effective)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-project-domains", project.id] });
      qc.invalidateQueries({ queryKey: ["grok-projects", project.profile_id] });
      toast(t("grok.assign_domains_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("grok.assign_domains_error"), "error"),
  });

  const toggle = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Globe size={16} className="text-violet-600" /> {t("grok.assign_domains_title")}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("grok.assign_domains_subtitle_prefix")} <code className="font-mono">{project.name}</code> {t("grok.assign_domains_subtitle_suffix")}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">{t("grok.assign_domains_loading")}</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-slate-500">{t("grok.assign_domains_empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {domains.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-white">
                    <input
                      type="checkbox"
                      checked={effective.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{d.label}</div>
                      <code className="text-[11px] font-mono text-slate-500">{d.hostname}</code>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="btn-ghost">{t("grok.assign_domains_cancel")}</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Save size={14} /> {save.isPending ? t("grok.assign_domains_saving") : t("grok.assign_domains_save", { value: effective.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
