import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Globe, Search, X } from "lucide-react";

import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  domain_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuditLogPage {
  rows: AuditLog[];
  total: number;
  offset: number;
  limit: number;
}

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
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const isSuper = me?.role === "super_admin";

  // Filter state — kept lightweight; pushed into `params` only on submit so
  // typing in a box doesn't refetch on every keystroke.
  const [pending, setPending] = useState({
    action: "",
    target_type: "",
    target_id: "",
    user_id: "",
    domain_id: "",
    date_from: "",
    date_to: "",
    q: "",
  });
  const [params, setParams] = useState(pending);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  // Domain tabs — super_admin gets a tab per registered domain plus "All".
  // The tab maps 1:1 to the `domain_id` filter so switching tabs is a
  // single setState; the table refetches via React Query's keying.
  const [activeTab, setActiveTab] = useState<string>("");  // "" = All

  // Self-view (customer) shape vs admin paged shape — branch up front.
  const isSelf = !isAdmin;
  const endpoint = isSelf ? "/api/audit-logs" : "/api/audit-logs/admin";

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", endpoint, params, offset, limit],
    queryFn: async () => {
      if (isSelf) {
        const r = await api.get<AuditLog[]>(endpoint, {
          params: params.action ? { action: params.action } : {},
        });
        return { rows: r.data, total: r.data.length, offset: 0, limit: r.data.length } satisfies AuditLogPage;
      }
      const queryParams: Record<string, string | number> = { offset, limit };
      for (const [k, v] of Object.entries(params)) {
        if (v) queryParams[k] = v;
      }
      const r = await api.get<AuditLogPage>(endpoint, { params: queryParams });
      return r.data;
    },
  });

  // Domains list — used both as the tab strip source AND the hostname lookup
  // for rendering the Domain column. Refetched every 30s so a new domain
  // created in another tab (or by another admin) shows up automatically
  // without a page reload — satisfies "log tab auto-sinh khi tạo domain".
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
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
    const cleared = {
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
        <h1 className="page-title">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSelf
            ? "Lịch sử hoạt động của bạn."
            : isSuper
            ? "Toàn bộ activity trên platform. Chọn tab để xem 1 tenant; tab tự sinh khi tạo domain mới."
            : "Activity trong domain của bạn."}
        </p>
      </header>

      {/* ─── Tab strip per domain — super_admin only ─── */}
      {isSuper && domains && domains.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="flex items-stretch border-b border-slate-100">
            <TabBtn active={activeTab === ""} onClick={() => setActiveTab("")}>
              <Globe size={14} />
              <span>Tất cả</span>
              <span className="text-xs text-slate-400">(toàn hệ thống)</span>
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
        <div className="card space-y-3 p-4">
          {/* Free-text search + action stay on one row for quick access */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search
              </span>
              <div className="mt-1 flex items-center rounded-md border border-slate-300 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
                  placeholder="Tìm trong action / metadata..."
                  value={pending.q}
                  onChange={(e) => setPending({ ...pending, q: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Action
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
                Target type
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
                User ID
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
                Target ID
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
                Date range
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

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500">
              {data && !isLoading && (
                <>
                  <strong className="text-slate-700">{data.total.toLocaleString()}</strong> kết quả
                  {Object.values(params).some(Boolean) && " (đã lọc)"}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="btn-ghost inline-flex items-center gap-1 text-sm"
              >
                <X className="h-3.5 w-3.5" /> Xóa lọc
              </button>
              <button type="button" onClick={applyFilters} className="btn-primary text-sm">
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Self-view simple filter ─── */}
      {isSelf && (
        <div className="card flex items-center gap-2 p-3">
          <input
            className="input flex-1"
            placeholder="Lọc theo action (vd: login)..."
            value={pending.action}
            onChange={(e) => setPending({ ...pending, action: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <button type="button" onClick={applyFilters} className="btn-primary">Áp dụng</button>
        </div>
      )}

      {/* ─── Table ─── */}
      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">User</th>
                {!isSelf && <th className="px-3 py-2">Domain</th>}
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((l) => (
                <tr key={l.id} className="border-t hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                    {new Date(l.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                    {l.action}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.target_type ? (
                      <button
                        type="button"
                        className="cursor-pointer text-slate-700 hover:text-violet-600"
                        onClick={() => {
                          if (l.target_id) {
                            setPending({ ...pending, target_id: l.target_id, target_type: l.target_type ?? "" });
                            setParams({ ...params, target_id: l.target_id, target_type: l.target_type ?? "" });
                            setOffset(0);
                          }
                        }}
                        title="Click để filter theo target này"
                      >
                        {l.target_type}:{l.target_id?.slice(0, 8)}
                      </button>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.user_email ? (
                      <button
                        type="button"
                        className="text-left hover:text-violet-600"
                        onClick={() => {
                          if (l.user_id) {
                            setPending({ ...pending, user_id: l.user_id });
                            setParams({ ...params, user_id: l.user_id });
                            setOffset(0);
                          }
                        }}
                      >
                        <span className="block truncate font-medium text-slate-700">
                          {l.user_email}
                        </span>
                        {l.user_role && (
                          <span className="text-[10px] uppercase text-slate-400">{l.user_role}</span>
                        )}
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {!isSelf && (
                    <td className="px-3 py-2 text-xs">
                      {l.domain_id ? (
                        <span className="font-mono text-slate-500">
                          {(domains ?? []).find((d) => d.id === l.domain_id)?.hostname
                            ?? l.domain_id.slice(0, 8)}
                        </span>
                      ) : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                    {l.ip_address ?? "—"}
                  </td>
                  <td className="max-w-md px-3 py-2 font-mono text-[11px] text-slate-500">
                    {l.metadata ? (
                      <details>
                        <summary className="cursor-pointer truncate">
                          {JSON.stringify(l.metadata).slice(0, 80)}
                          {JSON.stringify(l.metadata).length > 80 ? "…" : ""}
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2">
                          {JSON.stringify(l.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={isSelf ? 6 : 7} className="px-4 py-8 text-center text-slate-500">
                    Không có log nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Pagination — admin only (self-view is unpaged) ─── */}
      {!isSelf && data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select
              className="input w-24 py-1"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}/trang</option>
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
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>
            <span className="px-3 text-sm font-medium">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
              onClick={() => goPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Sau <ChevronRight className="h-4 w-4" />
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
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
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
