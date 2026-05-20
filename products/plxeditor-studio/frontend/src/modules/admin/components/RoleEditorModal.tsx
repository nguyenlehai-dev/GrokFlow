import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import { PAGE_GROUPS } from "../configs/pageCatalog";
import type { Role } from "../models/role";
import type { DomainForRoles as Domain } from "../models/domain";
import { rolesService } from "../services/roles.service";

export function RoleEditorModal({
  role, isCreate, domains, defaultDomainId, onClose,
}: {
  role: Role | null;
  isCreate: boolean;
  domains: Domain[];
  defaultDomainId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [domainId, setDomainId] = useState(role?.domain_id ?? defaultDomainId);
  const [pages, setPages] = useState<string[]>(role?.allowed_pages ?? []);
  const [status, setStatus] = useState(role?.status ?? "active");

  const domain = domains.find((d) => d.id === domainId);
  const domainAllowsAll = domain?.allow_all_pages ?? false;
  const domainAllowedSet = new Set(domain?.allowed_pages ?? []);

  const togglePage = (path: string) => {
    setPages((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name, description: description || null,
        allowed_pages: pages, status,
      };
      if (isCreate) body.domain_id = domainId;
      return isCreate
        ? rolesService.create(body)
        : rolesService.update(role!.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast(isCreate ? t("admin.re_created") : t("admin.re_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("admin.re_save_error"), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">
          {isCreate
            ? t("admin.re_create_title")
            : t("admin.re_edit_title", { name: role?.name ?? "" })}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.re_name_label")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.re_name_placeholder")} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.re_domain_label")}</label>
            <select
              className="input"
              value={domainId}
              onChange={(e) => { setDomainId(e.target.value); setPages([]); }}
              disabled={!isCreate}
            >
              <option value="">{t("admin.re_domain_placeholder")}</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
              ))}
            </select>
            {!isCreate && (
              <p className="text-xs text-slate-500 mt-1">{t("admin.re_domain_locked")}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("admin.re_description")}</label>
          <input className="input" value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium">{t("admin.re_status")}</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">{t("admin.de_status_active")}</option>
            <option value="disabled">{t("admin.de_status_disabled")}</option>
          </select>
        </div>

        <section className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.re_pages_title")}</h3>
          <p className="text-xs text-slate-500">{t("admin.re_pages_hint")}</p>
          {!domainId ? (
            <p className="text-slate-500">{t("admin.re_pages_pick_domain")}</p>
          ) : (
            <div className="space-y-3">
              {PAGE_GROUPS.map((group) => {
                const visibleItems = group.items.filter(
                  (i) => domainAllowsAll || domainAllowedSet.has(i.path),
                );
                if (visibleItems.length === 0) return null;
                const groupPaths = visibleItems.map((i) => i.path);
                const allOn = groupPaths.every((p) => pages.includes(p));
                const someOn = !allOn && groupPaths.some((p) => pages.includes(p));
                const toggleGroup = () => {
                  setPages((prev) =>
                    allOn
                      ? prev.filter((p) => !groupPaths.includes(p))
                      : Array.from(new Set([...prev, ...groupPaths])),
                  );
                };
                return (
                  <div key={group.key} className="border rounded-md p-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn; }}
                        onChange={toggleGroup}
                      />
                      <span className="font-semibold text-sm">{group.label}</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 pl-5 text-sm">
                      {visibleItems.map((p) => (
                        <label
                          key={p.path}
                          className="flex items-start gap-2 border rounded px-3 py-2 cursor-pointer hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={pages.includes(p.path)}
                            onChange={() => togglePage(p.path)}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{p.label}</span>
                            <span className="text-xs text-slate-500 block">{p.path}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">{t("common.cancel")}</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name || !domainId}
            className="btn-primary"
          >
            {save.isPending
              ? t("common.saving")
              : isCreate
                ? t("common.create")
                : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
