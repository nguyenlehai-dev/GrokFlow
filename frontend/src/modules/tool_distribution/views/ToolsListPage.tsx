import { useState, useMemo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Plus, Package, Edit3, Trash2, Upload, Download, ExternalLink,
  CheckCircle2, Pencil, Image as ImageIcon, Loader2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { api } from "@/core/api/axios";

import { toolsService } from "../services/tools.service";
import type { Tool, ToolAsset, AssetKind } from "../models/tool";
import { KIND_META } from "../models/tool";
import { CreateToolModal } from "../components/CreateToolModal";
import { EditToolModal } from "../components/EditToolModal";
import { UploadAssetModal } from "../components/UploadAssetModal";


/** Shared list page for /tools/win | /tools/mac | /tools/document.
 *
 *  Reads `:kind` from the URL and filters the same `tools` query response
 *  client-side — every tool may have assets across all 3 kinds, so the
 *  list shows tools that HAVE at least one asset of the active kind (or
 *  all tools if none have any yet, so admin can attach the first one).
 *
 *  Layout: card grid. Each card = 1 tool.
 *    ┌─────────────────────────────────┐
 *    │ [logo] Tool Name      [≡] [✕]   │  ← name + edit/delete admin
 *    │ Description text                │
 *    │ ──────────────────────────      │
 *    │ Assets for {kind}:              │
 *    │  • v1.2.0 — Setup x64  [↓ 247]  │
 *    │  • v1.1.0 — Setup x64  [↓ 89 ]  │
 *    │ [+ Upload]                      │
 *    └─────────────────────────────────┘ */
export function ToolsListPage() {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editToolId, setEditToolId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<{ tool: Tool; kind: AssetKind } | null>(null);

  // Validate the URL param. Unknown kind → redirect to /tools/win.
  const isValidKind = kindParam === "win" || kindParam === "mac" || kindParam === "document";
  const kind = (kindParam ?? "win") as AssetKind;

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["admin-tools"],
    queryFn: () => toolsService.list(),
  });

  // Helpers — promote, delete, download. Pre-declared so callbacks don't
  // recreate the mutation each render (TanStack would still dedupe but
  // this is cleaner).
  const promoteAsset = useMutation({
    mutationFn: (asset: ToolAsset) =>
      toolsService.updateAsset(asset.id, { is_latest: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tools"] });
      toast("Đã đánh dấu Latest", "success");
    },
  });
  const deleteAsset = useMutation({
    mutationFn: (asset: ToolAsset) => toolsService.deleteAsset(asset.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tools"] });
      toast("Đã xoá asset", "success");
    },
  });
  const deleteTool = useMutation({
    mutationFn: (tool: Tool) => toolsService.remove(tool.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tools"] });
      toast("Đã xoá tool", "success");
    },
  });

  if (!isValidKind) return <Navigate to="/tools/win" replace />;

  const meta = KIND_META[kind];

  // Filter assets per tool to just the active kind. Tools with no assets
  // of this kind are still shown so admin can attach the first one.
  const toolsWithFilteredAssets = useMemo(
    () => tools.map((t) => ({
      tool: t,
      filteredAssets: (t.assets ?? []).filter((a) => a.kind === kind),
    })),
    [tools, kind],
  );

  const downloadAsset = async (asset: ToolAsset) => {
    // The download endpoint is auth-gated — fetch via axios to attach JWT,
    // turn the response into a blob URL, click an invisible <a>. Standard
    // authed-download pattern.
    try {
      const r = await api.get(asset.download_url, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.file_name ?? asset.label;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a beat so the browser finishes the read.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      // Backend bumped download_count — refresh the list.
      qc.invalidateQueries({ queryKey: ["admin-tools"] });
    } catch (e) {
      toast("Tải file thất bại", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Tool · <span className="text-gradient">{meta.label}</span>
          </h1>
          <p className="page-subtitle">{meta.description}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={16} /> Thêm Tool
        </button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={20} />
        </div>
      ) : tools.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} kindLabel={meta.label} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {toolsWithFilteredAssets.map(({ tool, filteredAssets }) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              kind={kind}
              filteredAssets={filteredAssets}
              onEdit={() => setEditToolId(tool.id)}
              onDelete={() => {
                if (window.confirm(`Xoá tool "${tool.name}"? Tất cả assets (win/mac/doc) sẽ bị xoá theo.`)) {
                  deleteTool.mutate(tool);
                }
              }}
              onUpload={() => setUploadFor({ tool, kind })}
              onPromote={(asset) => promoteAsset.mutate(asset)}
              onDeleteAsset={(asset) => {
                if (window.confirm(`Xoá asset "${asset.label}"?`)) deleteAsset.mutate(asset);
              }}
              onDownload={(asset) => downloadAsset(asset)}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateToolModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["admin-tools"] })}
        />
      )}
      {editToolId && (
        <EditToolModal
          tool={tools.find((t) => t.id === editToolId)!}
          onClose={() => setEditToolId(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-tools"] })}
        />
      )}
      {uploadFor && (
        <UploadAssetModal
          tool={uploadFor.tool}
          kind={uploadFor.kind}
          onClose={() => setUploadFor(null)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["admin-tools"] })}
        />
      )}
    </div>
  );
}


function EmptyState({ onCreate, kindLabel }: { onCreate: () => void; kindLabel: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 grid place-items-center mb-3">
        <Package size={26} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-700">Chưa có tool nào</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md">
        Tạo tool đầu tiên (vd: <strong>Create Video Pro</strong>) rồi upload file cài đặt {kindLabel}.
      </p>
      <button onClick={onCreate} className="btn-primary mt-4 inline-flex items-center gap-1.5">
        <Plus size={16} /> Thêm Tool đầu tiên
      </button>
    </div>
  );
}


// ─── Card ──────────────────────────────────────────────────────────────


interface ToolCardProps {
  tool: Tool;
  kind: AssetKind;
  filteredAssets: ToolAsset[];
  onEdit: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onPromote: (asset: ToolAsset) => void;
  onDeleteAsset: (asset: ToolAsset) => void;
  onDownload: (asset: ToolAsset) => void;
}

function ToolCard({
  tool, kind, filteredAssets, onEdit, onDelete, onUpload,
  onPromote, onDeleteAsset, onDownload,
}: ToolCardProps) {
  return (
    <div className="card p-4 space-y-3 hover:shadow-md transition-shadow">
      {/* Header: logo + name + actions */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 ring-1 ring-slate-300/50 grid place-items-center overflow-hidden shrink-0">
          {tool.logo_url ? (
            <AuthedLogoImg src={tool.logo_url} alt={tool.name} />
          ) : (
            <ImageIcon size={20} className="text-slate-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 truncate">{tool.name}</h3>
            {tool.homepage_url && (
              <a
                href={tool.homepage_url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-blue-600"
                title={tool.homepage_url}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            {tool.code}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-slate-400 hover:text-blue-600 p-1" title="Sửa">
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} className="text-slate-400 hover:text-rose-600 p-1" title="Xoá">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {tool.description && (
        <p className="text-xs text-slate-500 line-clamp-2">{tool.description}</p>
      )}

      <div className="border-t border-slate-100 -mx-4 px-4 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            {KIND_META[kind].label} ({filteredAssets.length})
          </div>
          <button
            onClick={onUpload}
            className="text-[11px] inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
          >
            <Upload size={12} /> Upload
          </button>
        </div>

        {filteredAssets.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic py-2">
            Chưa có file {KIND_META[kind].label} — upload bản đầu tiên.
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredAssets.map((asset) => (
              <li key={asset.id} className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {asset.label}
                    </span>
                    {asset.is_latest && (
                      <span className="badge-cyan text-[9px] inline-flex items-center gap-0.5">
                        <CheckCircle2 size={9} /> LATEST
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    {asset.version && <span>v{asset.version}</span>}
                    {asset.file_size != null && <span>{formatBytes(asset.file_size)}</span>}
                    <span title="Số lần tải">↓ {asset.download_count}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!asset.is_latest && (
                    <button
                      onClick={() => onPromote(asset)}
                      className="p-1 text-slate-400 hover:text-cyan-600"
                      title="Đánh dấu Latest"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => onDownload(asset)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title="Tải file"
                  >
                    <Download size={11} />
                  </button>
                  <button
                    onClick={() => onDeleteAsset(asset)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title="Xoá"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


// ─── Helpers ───────────────────────────────────────────────────────────


function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


/** Img element that fetches the logo through axios (so the JWT travels
 *  in the header) then renders the blob URL. Same pattern as
 *  AuthedImage in the cvp-panels module — kept inline here because the
 *  tools page is the only consumer in this module and dragging in the
 *  cvp helper would create a cross-module import. */
function AuthedLogoImg({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // useEffect via lazy state init — only runs on mount/src-change.
  useMemo(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(src, { responseType: "blob" });
        if (!cancelled) setUrl(URL.createObjectURL(r.data));
      } catch { /* show fallback */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  if (!url) return <ImageIcon size={20} className="text-slate-400" />;
  return <img src={url} alt={alt} className="w-full h-full object-cover" />;
}
