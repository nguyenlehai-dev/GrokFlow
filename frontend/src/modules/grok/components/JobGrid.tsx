import { Eye, Images, Copy, Pencil, RefreshCw, Trash2, Star } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { jobsService } from "../services/jobs.service";
import type { Job } from "../models/job";

const isEditable = (s: string) => s === "queued";
const isRetryable = (s: string) => s === "failed" || s === "cancelled";
const isDeletable = (s: string) => !["running", "processing_provider"].includes(s);

export function JobGrid({
  items,
  onView,
  onGallery,
  onClone,
  onRetry,
  onEdit,
  onRemove,
  selectedIds,
  onToggleSelect,
}: {
  items: Job[];
  onView: (id: string) => void;
  onGallery: (j: Job) => void;
  onClone: (j: Job) => void;
  onRetry: (id: string) => void;
  onEdit: (j: Job) => void;
  onRemove: (j: Job) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="card py-10 text-center text-slate-500 text-sm">
        Chưa có job nào — bấm "Tạo job" để bắt đầu.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((j) => (
        <div
          key={j.id}
          className="card p-3 flex flex-col gap-2 hover:shadow-md transition cursor-pointer"
          onClick={() => onView(j.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={selectedIds?.has(j.id) ?? false}
                  onChange={() => onToggleSelect(j.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-pointer"
                  title="Chọn để so sánh / xoá"
                />
              )}
              <span className="font-mono text-xs text-slate-500">{j.id.slice(0, 8)}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {j.provider}/{j.job_type}
              </span>
              <FavoriteStar job={j} />
            </div>
            <StatusBadge status={j.status} />
          </div>
          {j.tags && j.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {j.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {t}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-slate-700 line-clamp-3 min-h-[3.75em]">
            {j.prompt || <span className="italic text-slate-400">(no prompt)</span>}
          </p>
          <div className="text-[11px] text-slate-400">
            {new Date(j.created_at).toLocaleString()}
          </div>
          <div
            className="flex items-center gap-1 pt-1 border-t border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <IconBtn title="Xem chi tiết" onClick={() => onView(j.id)} className="hover:bg-slate-200 text-slate-600">
              <Eye size={14} />
            </IconBtn>
            <IconBtn
              title={j.status === "success" ? "Xem kết quả" : "Chỉ xem được khi job success"}
              onClick={() => onGallery(j)}
              disabled={j.status !== "success"}
              className={j.status === "success" ? "hover:bg-emerald-100 text-emerald-600" : "text-slate-300 cursor-not-allowed"}
            >
              <Images size={14} />
            </IconBtn>
            <IconBtn title="Re-run" onClick={() => onClone(j)} className="hover:bg-indigo-100 text-indigo-600">
              <Copy size={14} />
            </IconBtn>
            <IconBtn
              title={isRetryable(j.status) ? "Retry" : "Chỉ retry được job failed/cancelled"}
              onClick={() => onRetry(j.id)}
              disabled={!isRetryable(j.status)}
              className={isRetryable(j.status) ? "hover:bg-blue-100 text-blue-600" : "text-slate-300 cursor-not-allowed"}
            >
              <RefreshCw size={14} />
            </IconBtn>
            <IconBtn
              title={isEditable(j.status) ? "Edit prompt" : "Chỉ sửa được job đang queued"}
              onClick={() => onEdit(j)}
              disabled={!isEditable(j.status)}
              className={isEditable(j.status) ? "hover:bg-amber-100 text-amber-600" : "text-slate-300 cursor-not-allowed"}
            >
              <Pencil size={14} />
            </IconBtn>
            <IconBtn
              title={isDeletable(j.status) ? "Xoá" : "Job đang chạy phải cancel trước"}
              onClick={() => onRemove(j)}
              disabled={!isDeletable(j.status)}
              className={`ml-auto ${isDeletable(j.status) ? "hover:bg-rose-100 text-rose-600" : "text-slate-300 cursor-not-allowed"}`}
            >
              <Trash2 size={14} />
            </IconBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

function FavoriteStar({ job }: { job: Job }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => jobsService.toggleFavorite(job.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const fav = !!job.is_favorite;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); m.mutate(); }}
      title={fav ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
      className={`p-0.5 rounded hover:bg-amber-50 ${fav ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
    >
      <Star size={14} fill={fav ? "currentColor" : "none"} />
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded ${className}`}
    >
      {children}
    </button>
  );
}
