import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ServerBackup } from "../models/types";

interface Props {
  backups: ServerBackup[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate?: () => void;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = months[d.getUTCMonth()];
  const yy = d.getUTCFullYear();
  const HH = String(d.getUTCHours()).padStart(2, "0");
  const MM = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yy} ${HH}:${MM}`;
}

export function BackupHistoryCard({ backups, onRestore, onDelete, onCreate }: Props) {
  const completed = backups.filter((b) => b.status === "complete").length;
  return (
    <div className="card flex flex-col gap-3">
      <ul className="space-y-3">
        {backups.map((b) => (
          <li key={b.id}>
            <div className="text-xs text-slate-500">{fmt(b.created_at)}</div>
            <div className="mt-1 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5
                            border border-sky-200">
              <button
                onClick={() => onRestore(b.id)}
                className="flex flex-1 items-center gap-2 text-sm font-medium text-blue-700
                           hover:text-blue-700"
              >
                <RotateCcw size={14} /> Restore
              </button>
              {onCreate && (
                <button
                  onClick={onCreate}
                  title="Tạo bản backup mới"
                  className="rounded-full p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                >
                  <Plus size={14} />
                </button>
              )}
              <button
                onClick={() => onDelete(b.id)}
                title="Xoá backup"
                className="rounded-full p-1 text-rose-700 hover:bg-rose-50 hover:text-rose-200"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-1">
          {Array.from({ length: backups.length }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i < completed ? "bg-emerald-500" : "bg-slate-200"}`}
            />
          ))}
        </div>
        <span className="text-xs text-slate-600">
          {completed}/{backups.length} File Backup Complete
        </span>
      </div>
    </div>
  );
}
