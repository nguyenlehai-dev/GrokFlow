import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, User as UserIcon, Pin, Power, PowerOff } from "lucide-react";

import type { Domain } from "../models/domain";
import type { UserRow } from "../models/project";
import { projectsService } from "../services/projects.service";

/** Domain row that expands to its users on click. Outer checkbox toggles
 *  the domain-wide assignment; inner checkboxes pin specific users.
 *
 *  Each assignment (both domain-level and per-user) also exposes a
 *  separate "enable/disable" toggle so super_admin can suspend a row
 *  without removing it. Disabled rows stay in the database and visible
 *  here but the job resolver treats them as if they didn't exist.
 */
export function ProjectDomainAssignRow({
  domain, checked, disabled = false, onToggle, onToggleDisabled,
  selectedUserIds, disabledUserIds, onToggleUser, onToggleUserDisabled,
}: {
  domain: Domain;
  checked: boolean;
  // Disabled state + handlers are optional so consumers that don't
  // care about per-row suspension (e.g. ProjectAutoProvisionModal,
  // which creates fresh assignments) can omit them.
  disabled?: boolean;
  onToggle: () => void;
  onToggleDisabled?: () => void;
  selectedUserIds: Set<string>;
  disabledUserIds?: Set<string>;
  onToggleUser: (id: string) => void;
  onToggleUserDisabled?: (id: string) => void;
}) {
  // Defaults for the optional props so the rest of the body can treat
  // them uniformly.
  const _disabledUserIds = disabledUserIds ?? new Set<string>();
  const _onToggleDisabled = onToggleDisabled ?? (() => {});
  const _onToggleUserDisabled = onToggleUserDisabled ?? (() => {});
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

  // Visual treatment for disabled-but-assigned rows: dim the labels +
  // strike-through the hostname so super_admin sees at a glance which
  // assignments are suspended. The disable button itself stays bright
  // so they can click it to re-enable.
  const rowDimClass = checked && disabled ? "opacity-60" : "";

  return (
    <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-1.5 ${rowDimClass}`}>
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
          <span className={`text-sm font-medium text-slate-800 ${disabled && checked ? "line-through" : ""}`}>
            {domain.label}
          </span>
          <code className="text-[11px] font-mono text-slate-500">{domain.hostname}</code>
          {pinnedInDomain > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
              <Pin size={9} /> {t("grok.assign_row_user_pinned", { value: pinnedInDomain })}
            </span>
          )}
          {checked && disabled && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              {t("grok.assign_row_disabled_badge")}
            </span>
          )}
        </button>
        {checked && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); _onToggleDisabled(); }}
            className={`p-1 rounded transition ${
              disabled
                ? "text-amber-600 hover:bg-amber-50"
                : "text-emerald-600 hover:bg-emerald-50"
            }`}
            title={
              disabled
                ? t("grok.assign_row_enable_title")
                : t("grok.assign_row_disable_title")
            }
          >
            {disabled ? <PowerOff size={14} /> : <Power size={14} />}
          </button>
        )}
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
              {users!.map((u) => {
                const pinned = selectedUserIds.has(u.id);
                const userDisabled = _disabledUserIds.has(u.id);
                return (
                  <li key={u.id}>
                    <div
                      className={`flex items-center gap-2 rounded px-2 py-1 hover:bg-white ${
                        pinned && userDisabled ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={pinned}
                        onChange={() => onToggleUser(u.id)}
                        className="cursor-pointer"
                      />
                      <UserIcon size={11} className="text-slate-400 flex-shrink-0" />
                      <span
                        className={`text-xs font-mono text-slate-700 flex-1 truncate ${
                          pinned && userDisabled ? "line-through" : ""
                        }`}
                      >
                        {u.email}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        {u.role}
                      </span>
                      {pinned && (
                        <button
                          type="button"
                          onClick={() => _onToggleUserDisabled(u.id)}
                          className={`p-0.5 rounded ${
                            userDisabled
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                          title={
                            userDisabled
                              ? t("grok.assign_row_enable_title")
                              : t("grok.assign_row_disable_title")
                          }
                        >
                          {userDisabled ? <PowerOff size={11} /> : <Power size={11} />}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
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
