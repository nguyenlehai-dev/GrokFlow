import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface AuditFilterState {
  action: string;
  target_type: string;
  target_id: string;
  user_id: string;
  domain_id: string;
  date_from: string;
  date_to: string;
  q: string;
}

export function AuditLogFilterBar({
  pending, setPending, applyFilters, clearFilters, params, data, isLoading, isSuper,
}: {
  pending: AuditFilterState;
  setPending: (next: AuditFilterState) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  params: AuditFilterState;
  data: { total: number } | undefined;
  isLoading: boolean;
  isSuper: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="card space-y-3 p-4">
      {/* Free-text search + action stay on one row for quick access */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_search")}
          </span>
          <div className="mt-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder={t("admin.audit_filter_search_ph")}
              value={pending.q}
              onChange={(e) => setPending({ ...pending, q: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_action")}
          </span>
          <input
            className="input mt-1 w-full"
            placeholder="login, profile_domains_set, ..."
            value={pending.action}
            onChange={(e) => setPending({ ...pending, action: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_target_type")}
          </span>
          <input
            className="input mt-1 w-full"
            placeholder="profile, domain, subscription, ..."
            value={pending.target_type}
            onChange={(e) => setPending({ ...pending, target_type: e.target.value })}
          />
        </label>
      </div>

      {/* IDs + domain + date range */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_user_id")}
          </span>
          <input
            className="input mt-1 w-full font-mono text-xs"
            placeholder="UUID"
            value={pending.user_id}
            onChange={(e) => setPending({ ...pending, user_id: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_target_id")}
          </span>
          <input
            className="input mt-1 w-full font-mono text-xs"
            placeholder="UUID"
            value={pending.target_id}
            onChange={(e) => setPending({ ...pending, target_id: e.target.value })}
          />
        </label>
        {/* Domain dropdown removed — replaced by tab strip above. The
            domain_id filter still flows through `params.domain_id`
            from the active tab via the effect upstream. */}
        <div className={isSuper ? "md:col-span-2" : "md:col-span-2"}>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("admin.audit_filter_date_range")}
          </span>
          <div className="mt-1 flex items-center gap-1">
            <input
              type="datetime-local"
              className="input w-full text-xs"
              value={pending.date_from}
              onChange={(e) => setPending({ ...pending, date_from: e.target.value })}
            />
            <span className="text-slate-400">→</span>
            <input
              type="datetime-local"
              className="input w-full text-xs"
              value={pending.date_to}
              onChange={(e) => setPending({ ...pending, date_to: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-3">
        <div className="text-xs text-slate-500">
          {data && !isLoading && (
            <>
              <strong className="text-slate-700">{data.total.toLocaleString()}</strong> {t("admin.audit_filter_results")}
              {Object.values(params).some(Boolean) && ` ${t("admin.audit_filter_filtered_suffix")}`}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearFilters}
            className="btn-ghost inline-flex items-center gap-1 text-sm"
          >
            <X className="h-3.5 w-3.5" /> {t("admin.audit_filter_clear")}
          </button>
          <button type="button" onClick={applyFilters} className="btn-primary text-sm">
            {t("admin.audit_filter_apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
