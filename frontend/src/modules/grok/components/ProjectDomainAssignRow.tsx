import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, User as UserIcon, Pin } from "lucide-react";

import type { Domain } from "../models/domain";
import type { UserRow } from "../models/project";
import { projectsService } from "../services/projects.service";

/** Domain row that expands to its users on click. Outer checkbox toggles
 *  the domain-wide assignment; inner checkboxes pin specific users. */
export function ProjectDomainAssignRow({
  domain, checked, onToggle, selectedUserIds, onToggleUser,
}: {
  domain: Domain;
  checked: boolean;
  onToggle: () => void;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Lazy-load users only when the row is expanded the first time, so
  // unticked domains don't fire N requests on modal open.
  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["domain-users", domain.id],
    queryFn: () => projectsService.usersByDomain(domain.id),
    enabled: open,
  });

  const pinnedInDomain = (users ?? []).filter((u) => selectedUserIds.has(u.id)).length;

  return (
    <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="text-sm font-medium text-slate-800">{domain.label}</span>
          <code className="text-[11px] font-mono text-slate-500">{domain.hostname}</code>
          {pinnedInDomain > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
              <Pin size={9} /> {t("grok.assign_row_user_pinned", { value: pinnedInDomain })}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-slate-400 hover:text-slate-700"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white/50 px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-slate-500 italic">{t("grok.assign_row_loading_users")}</p>
          ) : (users ?? []).length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              {t("grok.assign_row_no_users")}
            </p>
          ) : (
            <ul className="space-y-1">
              {users!.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => onToggleUser(u.id)}
                    />
                    <UserIcon size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-slate-700 flex-1 truncate">{u.email}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      {u.role}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-500 mt-1.5 italic">
            {t("grok.assign_row_tick_hint")}
          </p>
        </div>
      )}
    </div>
  );
}
