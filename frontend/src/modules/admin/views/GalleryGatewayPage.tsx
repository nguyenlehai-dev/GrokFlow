import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Workflow, Loader2, Cpu, Clock, Coins, MessageSquare, Search,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, Check, Layers,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { galleryGatewayService, type GatewayGalleryItem } from "../services/galleryGateway.service";


const VENDOR_COLORS: Record<string, string> = {
  google:    "bg-blue-100 text-blue-700",
  openai:    "bg-emerald-100 text-emerald-700",
  anthropic: "bg-amber-100 text-amber-700",
  xai:       "bg-violet-100 text-violet-700",
};

function fmtCents(c: number | null): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(4)}`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m}m trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h trước`;
  return `${Math.floor(h / 24)}d trước`;
}


export function GalleryGatewayPage() {
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const limit = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["gallery-gateway", vendor, page],
    queryFn: () => galleryGatewayService.list({
      vendor_code: vendor || undefined,
      offset: page * limit,
      limit,
    }),
    refetchInterval: 30_000,
  });

  // Build vendor list from items
  const vendors = Array.from(
    new Set((data?.items ?? []).map((i) => i.vendor_code).filter(Boolean))
  ) as string[];

  // In-memory filter for search
  const filtered = (data?.items ?? []).filter((it) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (it.response_excerpt ?? "").toLowerCase().includes(q)
      || (it.model ?? "").toLowerCase().includes(q)
      || (it.function_code ?? "").toLowerCase().includes(q)
      || it.gw_id.toLowerCase().includes(q)
    );
  });

  // Stats
  const stats = (data?.items ?? []).reduce(
    (acc, r) => {
      acc.total++;
      acc.cost += r.cost_cents ?? 0;
      acc.tokens += (r.tokens_input ?? 0) + (r.tokens_output ?? 0);
      acc.latency += r.latency_ms ?? 0;
      return acc;
    },
    { total: 0, cost: 0, tokens: 0, latency: 0 },
  );
  const avgLatency = stats.total > 0 ? stats.latency / stats.total : 0;

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 grid place-items-center">
          <Workflow size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gateway Gallery</h1>
          <p className="text-sm text-slate-500">
            Lịch sử các request LLM gateway — response, model, token usage, cost.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Layers}        label="Trên trang"   value={String(stats.total)}     hint={`${data?.total ?? 0} tổng`} />
        <StatCard icon={Coins}         label="Tổng cost"    value={fmtCents(stats.cost)}    hint="trên trang hiện tại" />
        <StatCard icon={MessageSquare} label="Total tokens" value={stats.tokens.toLocaleString()} hint="in + out" />
        <StatCard icon={Clock}         label="Avg latency"  value={fmtMs(Math.round(avgLatency))} hint="trên trang" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={vendor}
          onChange={(e) => { setVendor(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tất cả vendor</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="flex-1 min-w-[200px] flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm response / model / function / gw_id"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        {isFetching && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Đang tải…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="inline-flex w-16 h-16 rounded-full grid place-items-center bg-indigo-100 mb-4">
            <Workflow size={28} className="text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700">Chưa có request</h3>
          <p className="text-sm text-slate-500 mt-1">Khi gateway xử lý LLM call, kết quả sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <GatewayCard
              key={r.gw_id}
              item={r}
              expanded={expanded.has(r.gw_id)}
              onToggle={() => toggleExpand(r.gw_id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(data?.total ?? 0) > limit && (
        <footer className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">
            Trang <strong>{page + 1}</strong> / {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
              className="btn-ghost text-sm inline-flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={14} /> Prev
            </button>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="btn-ghost text-sm inline-flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}


function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Workflow; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wider">
        <Icon size={11} /> {label}
      </div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}


function GatewayCard({
  item, expanded, onToggle,
}: {
  item: GatewayGalleryItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const vendorColor = (item.vendor_code && VENDOR_COLORS[item.vendor_code]) || "bg-slate-100 text-slate-600";

  const copyResponse = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.response_excerpt ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Đã copy response", "success");
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white hover:border-indigo-300 transition overflow-hidden">
      {/* Header row */}
      <div className="flex items-stretch cursor-pointer" onClick={onToggle}>
        {/* Left rail: vendor color stripe */}
        <div className={`w-1 ${vendorColor.split(" ")[0].replace("100", "400")}`} />

        <div className="flex-1 p-3 grid grid-cols-12 gap-3 items-center min-w-0">
          {/* gw_id + time */}
          <div className="col-span-3 min-w-0">
            <div className="font-mono text-xs text-slate-700 truncate">{item.gw_id}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{fmtRelTime(item.created_at)}</div>
          </div>

          {/* Vendor + model */}
          <div className="col-span-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${vendorColor}`}>
                {item.vendor_code ?? "—"}
              </span>
              <span className="text-xs font-mono text-slate-700 truncate" title={item.model ?? ""}>{item.model ?? "—"}</span>
            </div>
            {item.function_code && (
              <div className="text-[10px] text-slate-500 mt-0.5">{item.function_code}</div>
            )}
          </div>

          {/* Response excerpt */}
          <div className="col-span-4 min-w-0 text-xs text-slate-700">
            <div className="line-clamp-1" title={item.response_excerpt ?? ""}>
              {item.response_excerpt ?? <span className="text-slate-400">no excerpt</span>}
            </div>
          </div>

          {/* Tokens + cost */}
          <div className="col-span-2 text-right">
            <div className="text-xs font-mono">
              <span className="text-slate-500">{item.tokens_input ?? 0}</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className="text-indigo-600">{item.tokens_output ?? 0}</span>
            </div>
            <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">{fmtCents(item.cost_cents)}</div>
            <div className="text-[10px] text-slate-400">{fmtMs(item.latency_ms)}</div>
          </div>
        </div>

        {/* Chevron */}
        <div className="px-3 grid place-items-center text-slate-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expandable response body */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Response (excerpt ≤ 200 chars)
            </div>
            <button
              onClick={copyResponse}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600"
            >
              {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="text-xs text-slate-800 whitespace-pre-wrap font-mono bg-white rounded border border-slate-200 p-2 max-h-48 overflow-auto">
{item.response_excerpt ?? "(no excerpt)"}
          </pre>
          {item.domain_hostname && (
            <div className="text-[11px] text-slate-500">
              <Cpu size={11} className="inline mr-1" />
              Tenant: <code className="font-mono">{item.domain_hostname}</code>
              {item.domain_brand_name && <span className="ml-1 text-slate-400">({item.domain_brand_name})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
