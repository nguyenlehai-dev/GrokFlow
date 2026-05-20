import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, Globe, Wand2, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { domainsService } from "../services/domains.service";
import { projectsService } from "../services/projects.service";
import { ProjectDomainAssignRow } from "./ProjectDomainAssignRow";

/** Driver script provisions a Grok project automatically:
 *    open Grok in profile's VNC browser → click "New Project" →
 *    fill name → capture slug → save to DB + apply assignments.
 *
 *  Saves the super_admin the manual copy/paste flow. The backend
 *  endpoint connects to the profile's CDP port; profile MUST be
 *  logged_in for this to work. */
export function ProjectAutoProvisionModal({
  profileId, profileName, onClose,
}: { profileId: string; profileName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAdminDomains(),
  });
  const tenantDomains = (domains ?? []).filter((d) => d.hostname !== "*");
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const toggleDomain = (id: string) => {
    const next = new Set(selectedDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomains(next);
  };
  const toggleUser = (id: string) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUsers(next);
  };

  const provision = useMutation({
    mutationFn: () =>
      projectsService.autoProvision({
        profile_id: profileId,
        name: name.trim(),
        description: description || null,
        domain_ids: Array.from(selectedDomains),
        user_ids: Array.from(selectedUsers),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(t("grok.project_auto_success", { name: data.name, slug: data.grok_project_id }), "success");
      onClose();
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      const msg = detail?.message ?? t("grok.project_auto_error");
      // Common case: Grok's UI changed faster than our selectors.
      // Toast the message + hint at manual fallback so user isn't stuck.
      toast(
        msg.length > 200
          ? `${msg.slice(0, 200)}… → ${t("grok.project_auto_fallback_long")}`
          : `${msg} → ${t("grok.project_auto_fallback_short")}`,
        "error",
      );
    },
  });

  const disabled = !name.trim() || provision.isPending;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] rounded-xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2">
              <Wand2 size={16} className="text-violet-600" /> {t("grok.project_auto_title")}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("grok.project_auto_subtitle_prefix")} <code className="font-mono">{profileName}</code> · {t("grok.project_auto_subtitle_suffix")}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Pre-flight check note */}
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed">
            <strong>{t("grok.project_auto_req_label")}</strong> {t("grok.project_auto_req_prefix")} <code className="font-mono">{profileName}</code> {t("grok.project_auto_req_middle")} <code className="font-mono">logged_in</code> {t("grok.project_auto_req_suffix")}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {t("grok.project_auto_name_label")} <span className="text-rose-500">*</span>
            </span>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("grok.project_auto_name_placeholder")}
            />
            <p className="text-xs text-slate-500 mt-1">
              {t("grok.project_auto_name_hint")}
            </p>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("grok.project_auto_desc_label")}</span>
            <textarea
              className="input mt-1"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("grok.project_auto_desc_placeholder")}
            />
          </label>

          {/* Assignment picker — reuse the DomainRow component */}
          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-slate-800">
                {t("grok.project_auto_assign_title")}
              </span>
            </div>
            {tenantDomains.length === 0 ? (
              <p className="text-xs text-slate-500 italic">{t("grok.project_auto_no_domains")}</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {tenantDomains.map((d) => (
                  <ProjectDomainAssignRow
                    key={d.id}
                    domain={d}
                    checked={selectedDomains.has(d.id)}
                    onToggle={() => toggleDomain(d.id)}
                    selectedUserIds={selectedUsers}
                    onToggleUser={toggleUser}
                  />
                ))}
              </div>
            )}
          </section>

          {provision.isPending && (
            <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-900 inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {t("grok.project_auto_progress")}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-white">
          <button onClick={onClose} className="btn-ghost" disabled={provision.isPending}>
            {t("grok.project_auto_cancel")}
          </button>
          <button
            onClick={() => provision.mutate()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
          >
            {provision.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {provision.isPending
              ? t("grok.project_auto_creating")
              : `${t("grok.project_auto_submit")} · ${t("grok.project_auto_summary", { domains: selectedDomains.size, users: selectedUsers.size })}`}
          </button>
        </div>
      </div>
    </div>
  );
}
