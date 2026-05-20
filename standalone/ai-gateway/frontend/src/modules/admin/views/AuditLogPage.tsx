import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import type { AuditLogPageOut } from "../models/auditLog";
import { auditService } from "../services/audit.service";
import { domainsService } from "../services/domains.service";
import { AuditLogFilterBar, type AuditFilterState } from "../components/AuditLogFilterBar";
import { AuditLogTable } from "../components/AuditLogTable";

interface Domain {
  id: string;
  hostname: string;
  status?: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/** Audit log explorer.
 *
 *  Admin tier: every action recorded across the platform (or scoped to the
 *  caller's domain for non-super_admin) with multi-filter table +
 *  pagination. Customer tier: their own actions only (no filters).
 *
 *  Filters supported (admin view):
 *    - action      exact match (e.g. "login", "profile_domains_set")
 *    - target_type exact match (e.g. "profile", "domain", "subscription")
 *    - target_id   UUID exact (paste from a "Target" cell to drill down)
 *    - user_id     UUID exact (pivot from a row to that user's full history)
 *    - domain_id   tenant scope (super_admin only — per-domain admin is
 *                  auto-scoped to its own domain by the backend)
 *    - date_from / date_to    timezone-local datetime
 *    - q           free-text substring (action + metadata::text)
 */
export function AuditLogPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const isSuper = me?.role === "super_admin";

  // Filter state — kept lightweight; pushed into `params` only on submit so
  // typing in a box doesn't refetch on every keystroke.
  const [pending, setPending] = useState<AuditFilterState>({
    action: "",
    target_type: "",
    target_id: "",
    user_id: "",
    domain_id: "",
    date_from: "",
    date_to: "",
    q: "",
  });
  const [params, setParams] = useState<AuditFilterState>(pending);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  // Domain tabs — super_admin gets a tab per registered domain plus "All".
  // The tab maps 1:1 to the `domain_id` filter so switching tabs is a
  // single setState; the table refetches via React Query's keying.
  const [activeTab, setActiveTab] = useState<string>("");  // "" = All

  // Self-view (customer) shape vs admin paged shape — branch up front.
  const isSelf = !isAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", isSelf, params, offset, limit],
    queryFn: async () => {
      if (isSelf) {
        const rows = await auditService.listSelf(
          params.action ? { action: params.action } : {},
        );
        return { rows, total: rows.length, offset: 0, limit: rows.length } satisfies AuditLogPageOut;
      }
      const queryParams: Record<string, string | number> = { offset, limit };
      for (const [k, v] of Object.entries(params)) {
        if (v) queryParams[k] = v;
      }
      return auditService.listAdmin(queryParams);
    },
  });

  // Domains list — used both as the tab strip source AND the hostname lookup
  // for rendering the Domain column. Refetched every 30s so a new domain
  // created in another tab (or by another admin) shows up automatically
  // without a page reload — satisfies "log tab auto-sinh khi tạo domain".
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<Domain>(),
    enabled: isSuper,
    refetchInterval: 30_000,
  });

  // Keep the activeTab + the actual filter in sync. Switching tabs replaces
  // pending.domain_id then re-applies — single source of truth is the tab.
  useEffect(() => {
    setPending((p) => ({ ...p, domain_id: activeTab }));
    setParams((p) => ({ ...p, domain_id: activeTab }));
    setOffset(0);
  }, [activeTab]);

  const applyFilters = () => {
    setOffset(0);
    setParams(pending);
  };

  const clearFilters = () => {
    const cleared: AuditFilterState = {
      action: "", target_type: "", target_id: "",
      user_id: "", domain_id: "", date_from: "", date_to: "", q: "",
    };
    setPending(cleared);
    setParams(cleared);
    setOffset(0);
  };

  const totalPages = useMemo(() => {
    if (!data || isSelf) return 1;
    return Math.max(1, Math.ceil(data.total / limit));
  }, [data, limit, isSelf]);

  const currentPage = isSelf ? 1 : Math.floor(offset / limit) + 1;

  const goPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setOffset((clamped - 1) * limit);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t("audit.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSelf
            ? t("audit.desc_self")
            : isSuper
            ? t("audit.desc_super")
            : t("audit.desc_admin")}
        </p>
      </header>

      {/* ─── Tab strip per domain — super_admin only ─── */}
      {isSuper && domains && domains.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="flex items-stretch border-b border-slate-200">
            <TabBtn active={activeTab === ""} onClick={() => setActiveTab("")}>
              <Globe size={14} />
              <span>{t("audit.tab_all")}</span>
              <span className="text-xs text-slate-400">{t("audit.tab_all_subtitle")}</span>
            </TabBtn>
            {domains.map((d) => (
              <TabBtn
                key={d.id}
                active={activeTab === d.id}
                onClick={() => setActiveTab(d.id)}
              >
                <span>{d.hostname}</span>
                {d.status === "active" ? (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ) : (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                )}
              </TabBtn>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filter bar — admin only ─── */}
      {!isSelf && (
        <AuditLogFilterBar
          pending={pending}
          setPending={setPending}
          applyFilters={applyFilters}
          clearFilters={clearFilters}
          params={params}
          data={data}
          isLoading={isLoading}
          isSuper={isSuper}
        />
      )}

      {/* ─── Self-view simple filter ─── */}
      {isSelf && (
        <div className="card flex items-center gap-2 p-3">
          <input
            className="input flex-1"
            placeholder={t("audit.self_filter_placeholder")}
            value={pending.action}
            onChange={(e) => setPending({ ...pending, action: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <button type="button" onClick={applyFilters} className="btn-primary">{t("audit.apply")}</button>
        </div>
      )}

      {/* ─── Table ─── */}
      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <AuditLogTable
          rows={data?.rows ?? []}
          isSelf={isSelf}
          domains={domains ?? []}
          pending={pending}
          params={params}
          setPending={setPending}
          setParams={setParams}
          setOffset={setOffset}
        />
      )}

      {/* ─── Pagination — admin only (self-view is unpaged) ─── */}
      {!isSelf && data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>{t("audit.show")}</span>
            <select
              className="input w-24 py-1"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{t("audit.per_page", { n })}</option>
              ))}
            </select>
            <span>
              {offset + 1}–{Math.min(offset + limit, data.total)} / {data.total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
              onClick={() => goPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> {t("audit.prev")}
            </button>
            <span className="px-3 text-sm font-medium">
              {t("audit.pages", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
              onClick={() => goPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              {t("audit.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single tab button used in the domain tab strip. Active tab shows a
 *  violet underline; hover lightens; long hostnames truncate with `max-w`.
 *  Children render inline so callers can pass an icon + name + status dot
 *  (or anything else) in one block. */
function TabBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex flex-shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition",
        active
          ? "text-violet-700"
          : "text-slate-600 hover:bg-white hover:text-slate-800",
      ].join(" ")}
    >
      {children}
      {active && (
        <span
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-600"
          aria-hidden
        />
      )}
    </button>
  );
}
