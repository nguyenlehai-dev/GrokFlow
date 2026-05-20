import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Key, Plus, Search, BookOpen } from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import type { ApiKey } from "../models/apiKey";
import type { DomainOpt as Domain } from "../models/user";
import { apiKeysService } from "../services/apiKeys.service";
import { domainsService } from "../services/domains.service";
import { ApiKeyCreateModal } from "../components/ApiKeyCreateModal";
import { ApiKeyCreatedModal } from "../components/ApiKeyCreatedModal";
import { ApiKeyHelpModal } from "../components/ApiKeyHelpModal";
import {
  ApiKeyDomainGroup,
  ApiKeysEmptyState,
  ApiKeysTable,
} from "../components/ApiKeysTable";

export function ApiKeysPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const isAdmin = me?.role === "admin" || isSuper;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [created, setCreated] = useState<{ name: string; api_key: string } | null>(null);

  const STATUS_OPTIONS = [
    { v: "", label: t("api_keys.status_all") },
    { v: "active", label: t("api_keys.status_active") },
    { v: "revoked", label: t("api_keys.status_revoked") },
  ];

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys", domainFilter, statusFilter],
    queryFn: () =>
      apiKeysService.list({
        status: statusFilter || undefined,
        domain_id: domainFilter || undefined,
      }),
  });

  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<Domain>(),
    enabled: isSuper,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysService.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast(t("api_keys.revoked_toast"), "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("api_keys.op_error"), "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiKeysService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast(t("api_keys.deleted_toast"), "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("api_keys.op_error"), "error"),
  });

  const filtered = useMemo(() => {
    const items = keys ?? [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.key_prefix.toLowerCase().includes(q) ||
        (k.user_email ?? "").toLowerCase().includes(q) ||
        (k.domain_hostname ?? "").toLowerCase().includes(q),
    );
  }, [keys, search]);

  const groupedByDomain = useMemo(() => {
    if (!isSuper) return null;
    const map = new Map<string, { hostname: string; items: ApiKey[] }>();
    for (const k of filtered) {
      const key = k.domain_hostname ?? "(no domain)";
      if (!map.has(key)) map.set(key, { hostname: key, items: [] });
      map.get(key)!.items.push(k);
    }
    return Array.from(map.values()).sort((a, b) => a.hostname.localeCompare(b.hostname));
  }, [filtered, isSuper]);

  const stats = useMemo(() => {
    const all = keys ?? [];
    return {
      total: all.length,
      active: all.filter((k) => k.status === "active").length,
      revoked: all.filter((k) => k.status === "revoked").length,
      used_today: all.reduce((s, k) => s + k.used_today, 0),
    };
  }, [keys]);

  const confirmDelete = (id: string, name: string) => {
    if (confirm(t("api_keys.delete_confirm", { name }))) remove.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 shadow">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">API Keys</p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Key size={22} />
              {isSuper ? t("api_keys.title_super") : t("api_keys.title_user")}
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {isSuper
                ? t("api_keys.desc_super")
                : isAdmin
                ? t("api_keys.desc_admin")
                : t("api_keys.desc_user")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelp(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium border border-white/30"
              title={t("api_keys.help_title")}
            >
              <BookOpen size={14} /> {t("api_keys.help_btn")}
            </button>
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 backdrop-blur-sm px-4 py-2 text-sm font-medium"
            >
              <Plus size={16} /> {t("api_keys.create_btn")}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
          <Stat label={t("api_keys.stat_total")} value={stats.total} />
          <Stat label={t("api_keys.stat_active")} value={stats.active} />
          <Stat label={t("api_keys.stat_revoked")} value={stats.revoked} />
          <Stat label={t("api_keys.stat_used_today")} value={stats.used_today} />
        </div>
      </div>

      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-slate-600">{t("api_keys.search_label")}</label>
          <div className="mt-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search size={14} className="text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder={t("api_keys.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">{t("api_keys.status")}</label>
          <select
            className="input mt-1 w-32 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        {isSuper && (
          <div className="min-w-[200px]">
            <label className="text-xs font-medium text-slate-600">{t("api_keys.domain")}</label>
            <select
              className="input mt-1 w-full text-sm"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
            >
              <option value="">{t("api_keys.domain_all")}</option>
              {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          </div>
        )}
        <div className="text-xs text-slate-500">
          {t("api_keys.count_summary", { shown: filtered.length, total: keys?.length ?? 0 })}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : isSuper && groupedByDomain ? (
        <div className="space-y-4">
          {groupedByDomain.length === 0 ? (
            <ApiKeysEmptyState />
          ) : (
            groupedByDomain.map((g) => (
              <ApiKeyDomainGroup
                key={g.hostname}
                hostname={g.hostname}
                items={g.items}
                onRevoke={(id) => revoke.mutate(id)}
                onDelete={confirmDelete}
              />
            ))
          )}
        </div>
      ) : (
        <ApiKeysTable
          items={filtered}
          showOwner={isAdmin}
          onRevoke={(id) => revoke.mutate(id)}
          onDelete={confirmDelete}
        />
      )}

      {help && <ApiKeyHelpModal onClose={() => setHelp(false)} />}
      {open && <ApiKeyCreateModal onClose={() => setOpen(false)} onCreated={(c) => { setCreated(c); setOpen(false); }} />}
      {created && <ApiKeyCreatedModal value={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/15 backdrop-blur-sm px-3 py-2">
      <p className="opacity-80">{label}</p>
      <p className="font-bold text-lg leading-tight">{value.toLocaleString()}</p>
    </div>
  );
}
