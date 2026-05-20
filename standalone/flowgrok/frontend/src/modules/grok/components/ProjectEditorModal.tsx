import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, Globe, Save, Pin } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import type { Project } from "../models/project";
import { domainsService } from "../services/domains.service";
import { projectsService } from "../services/projects.service";
import { ProjectDomainAssignRow } from "./ProjectDomainAssignRow";

export function ProjectEditorModal({
  profileId, project, onClose,
}: { profileId: string; project: Project | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!project;
  const [grokId, setGrokId] = useState(project?.grok_project_id ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  // Fetch all tenant domains (* fallback excluded) so the user can pick
  // assignments inline at creation. Saves a 2nd modal trip.
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAdminDomains(),
  });
  const tenantDomains = (domains ?? []).filter((d) => d.hostname !== "*");

  // For edit mode, prefill the current assignments.
  const { data: currentAssign } = useQuery({
    queryKey: ["grok-project-domains", project?.id],
    queryFn: () => projectsService.getDomains(project!.id),
    enabled: isEdit,
  });

  const { data: currentUsers } = useQuery({
    queryKey: ["grok-project-users", project?.id],
    queryFn: () => projectsService.getUsers(project!.id),
    enabled: isEdit,
  });

  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string> | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string> | null>(null);
  // Disabled subsets — assigned-but-suspended rows. Persisted via the
  // `disabled_*_ids` field on the corresponding PUT endpoint. Resolver
  // ignores these assignments as if they didn't exist.
  const [disabledDomainIds, setDisabledDomainIds] = useState<Set<string> | null>(null);
  const [disabledUserIds, setDisabledUserIds] = useState<Set<string> | null>(null);

  const effectiveDomains = selectedDomainIds ?? new Set(currentAssign?.domain_ids ?? []);
  const effectiveUsers = selectedUserIds ?? new Set(currentUsers?.user_ids ?? []);
  const effectiveDisabledDomains =
    disabledDomainIds ?? new Set(currentAssign?.disabled_domain_ids ?? []);
  const effectiveDisabledUsers =
    disabledUserIds ?? new Set(currentUsers?.disabled_user_ids ?? []);

  const toggleDomain = (id: string) => {
    const next = new Set(effectiveDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomainIds(next);
    // Unchecking a domain implicitly removes any disabled flag on it.
    if (effectiveDisabledDomains.has(id)) {
      const d = new Set(effectiveDisabledDomains);
      d.delete(id);
      setDisabledDomainIds(d);
    }
  };
  const toggleUser = (id: string) => {
    const next = new Set(effectiveUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUserIds(next);
    if (effectiveDisabledUsers.has(id)) {
      const d = new Set(effectiveDisabledUsers);
      d.delete(id);
      setDisabledUserIds(d);
    }
  };
  const toggleDomainDisabled = (id: string) => {
    const next = new Set(effectiveDisabledDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDisabledDomainIds(next);
  };
  const toggleUserDisabled = (id: string) => {
    const next = new Set(effectiveDisabledUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDisabledUserIds(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      let projectId: string;
      if (isEdit) {
        await projectsService.update(project!.id, {
          grok_project_id: grokId.trim() || undefined,
          name: name.trim() || undefined,
          description: description || null,
        });
        projectId = project!.id;
      } else {
        const data = await projectsService.create({
          profile_id: profileId,
          grok_project_id: grokId.trim(),
          name: name.trim(),
          description: description || null,
        });
        projectId = data.id;
      }
      // Push both assignment sets in parallel — include the disabled
      // subsets so the resolver respects user's per-row toggles.
      await Promise.all([
        projectsService.setDomains(
          projectId,
          Array.from(effectiveDomains),
          Array.from(effectiveDisabledDomains).filter((d) => effectiveDomains.has(d)),
        ),
        projectsService.setUsers(
          projectId,
          Array.from(effectiveUsers),
          Array.from(effectiveDisabledUsers).filter((u) => effectiveUsers.has(u)),
        ),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["grok-project-domains", project?.id] });
      qc.invalidateQueries({ queryKey: ["grok-project-users", project?.id] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(
        `${isEdit ? t("grok.project_editor_saved") : t("grok.project_editor_created")} · ${t("grok.project_editor_summary_pinned", { domains: effectiveDomains.size, users: effectiveUsers.size })}`,
        "success",
      );
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("grok.project_editor_error"), "error"),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] rounded-xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{isEdit ? t("grok.project_editor_edit_title", { name: project!.name }) : t("grok.project_editor_add_title")}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {t("grok.project_editor_slug_label")} <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1 font-mono"
              value={grokId}
              onChange={(e) => setGrokId(e.target.value)}
              placeholder={t("grok.project_editor_slug_placeholder")}
            />
            {!isEdit && (
              <div className="mt-1.5 rounded-md bg-violet-50 border border-violet-100 p-2 text-[11px] text-violet-900 leading-relaxed">
                <strong>{t("grok.project_editor_slug_howto_title")}</strong>{" "}
                {t("grok.project_editor_slug_howto_p1")} <a href="https://grok.com" target="_blank" rel="noreferrer" className="underline">grok.com</a> →
                {t("grok.project_editor_slug_howto_p2")} <strong>{t("grok.project_editor_new_project_btn")}</strong> {t("grok.project_editor_slug_howto_p3")}
                <code className="font-mono bg-white px-1 rounded mx-0.5">grok.com/project/abc-123-...</code>
                → {t("grok.project_editor_slug_howto_p4")} <code className="font-mono">/project/</code> {t("grok.project_editor_slug_howto_p5")}
              </div>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {t("grok.project_editor_name_label")} <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("grok.project_editor_name_placeholder")}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("grok.project_editor_desc_label")}</span>
            <textarea
              className="input mt-1"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("grok.project_editor_desc_placeholder")}
            />
          </label>

          {/* Two-level assignment: domain rows can expand to show their
              users, letting super_admin pin specific users to this project
              (overrides the domain-wide rule for those users). */}
          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">
                {t("grok.project_editor_assign_title")}
              </span>
              <span className="text-xs text-slate-500">
                {t("grok.project_editor_assign_subtitle")}
              </span>
            </div>
            {tenantDomains.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                {t("grok.project_editor_no_domains")}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-auto">
                {tenantDomains.map((d) => (
                  <ProjectDomainAssignRow
                    key={d.id}
                    domain={d}
                    checked={effectiveDomains.has(d.id)}
                    disabled={effectiveDisabledDomains.has(d.id)}
                    onToggle={() => toggleDomain(d.id)}
                    onToggleDisabled={() => toggleDomainDisabled(d.id)}
                    selectedUserIds={effectiveUsers}
                    disabledUserIds={effectiveDisabledUsers}
                    onToggleUser={toggleUser}
                    onToggleUserDisabled={toggleUserDisabled}
                  />
                ))}
              </div>
            )}
            <div className="mt-3 rounded-md bg-white/70 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
              <strong>{t("grok.project_editor_rules_title")}</strong><br />
              {t("grok.project_editor_rule_1_prefix")} <Pin size={9} className="inline text-violet-600" />{" "}
              {t("grok.project_editor_rule_1_suffix")}<br />
              {t("grok.project_editor_rule_2")}<br />
              {t("grok.project_editor_rule_3")}
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-white">
          <button onClick={onClose} className="btn-ghost">{t("grok.project_editor_cancel")}</button>
          <button
            onClick={() => save.mutate()}
            disabled={!grokId.trim() || !name.trim() || save.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Save size={14} />
            {save.isPending
              ? t("grok.project_editor_saving")
              : isEdit
              ? `${t("grok.project_editor_save")} · ${t("grok.project_editor_summary", { domains: effectiveDomains.size, users: effectiveUsers.size })}`
              : `${t("grok.project_editor_create")} · ${t("grok.project_editor_summary", { domains: effectiveDomains.size, users: effectiveUsers.size })}`}
          </button>
        </div>
      </div>
    </div>
  );
}
