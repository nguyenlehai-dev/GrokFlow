import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Trash2, Calendar, Play, Loader2, FolderOpen } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { monitoringService } from "../services/monitoring.service";


const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: "Tắt",                   cron: "" },
  { label: "Hằng ngày 02:00 UTC",   cron: "0 2 * * *" },
  { label: "Hằng ngày 18:00 UTC (= 01:00 VN)", cron: "0 18 * * *" },
  { label: "Mỗi thứ 7 03:00 UTC",   cron: "0 3 * * 6" },
];


/** Modal: configure daily backup for one server.
 *
 *  Backend SSH-runs tar + pg_dump on the remote box. Admin specifies:
 *  - cron schedule (UTC)
 *  - target directory on the server (where backups land)
 *  - list of paths to tar (e.g. ["/home/vpsroot/grokflow"])
 *  - postgres db name (optional)
 *  - retain_days (auto-prune)
 *
 *  Also has a "Backup ngay" button that synchronously runs one backup
 *  (can take minutes — modal shows a spinner). */
export function BackupConfigModal({
  serverId, onClose,
}: { serverId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-server-backup-config", serverId],
    queryFn: () => monitoringService.getBackupConfig(serverId),
  });

  const [cron, setCron] = useState("");
  const [targetPath, setTargetPath] = useState("/opt/backups");
  const [paths, setPaths] = useState<string[]>([]);
  const [dbName, setDbName] = useState("");
  const [retainDays, setRetainDays] = useState(7);
  const [newPath, setNewPath] = useState("");

  useEffect(() => {
    if (data) {
      setCron(data.cron ?? "");
      setTargetPath(data.target_path);
      setPaths(data.paths);
      setDbName(data.db_name ?? "");
      setRetainDays(data.retain_days);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => monitoringService.setBackupConfig(serverId, {
      cron: cron.trim() || null,
      target_path: targetPath.trim() || "/opt/backups",
      paths,
      db_name: dbName.trim() || null,
      retain_days: retainDays,
    }),
    onSuccess: () => {
      toast("Đã lưu cấu hình backup", "success");
      qc.invalidateQueries({ queryKey: ["admin-server-backup-config", serverId] });
      qc.invalidateQueries({ queryKey: ["admin-server-backup-history", serverId] });
    },
    onError: (e: { response?: { data?: { detail?: { message?: string } } } }) =>
      toast(e?.response?.data?.detail?.message ?? "Lỗi lưu", "error"),
  });

  const runNow = useMutation({
    mutationFn: () => monitoringService.backupNow(serverId),
    onSuccess: (row) => {
      toast(row.status === "success"
        ? `Backup OK: ${formatBytes(row.size_bytes ?? 0)} → ${row.output_path}`
        : `Backup thất bại: ${row.error_message ?? ""}`,
        row.status === "success" ? "success" : "error");
      qc.invalidateQueries({ queryKey: ["admin-server-backup-config", serverId] });
      qc.invalidateQueries({ queryKey: ["admin-server-backup-history", serverId] });
    },
    onError: (e: { response?: { data?: { detail?: { message?: string } } } }) =>
      toast(e?.response?.data?.detail?.message ?? "Backup lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Cấu hình backup hằng ngày</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-slate-500">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Đang tải…
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-slate-700">Cron schedule (UTC)</label>
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 2 * * *"
                className="input mt-1 font-mono"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setCron(p.cron)}
                    className={`text-[11px] px-2 py-1 rounded-full ring-1 transition-colors ${
                      cron.trim() === p.cron
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-300"
                        : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Thư mục lưu (trên server)</label>
                <div className="flex items-center gap-1 mt-1">
                  <FolderOpen size={14} className="text-slate-400" />
                  <input
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                    className="input font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Retain (ngày)</label>
                <input
                  type="number" min={1} max={365}
                  value={retainDays}
                  onChange={(e) => setRetainDays(Number(e.target.value) || 7)}
                  className="input mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Paths tar (mỗi dòng 1 path)
              </label>
              <div className="space-y-1 mt-1">
                {paths.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={p}
                      onChange={(e) => {
                        const next = [...paths];
                        next[i] = e.target.value;
                        setPaths(next);
                      }}
                      className="input flex-1 font-mono text-sm"
                    />
                    <button
                      onClick={() => setPaths(paths.filter((_, j) => j !== i))}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/home/vpsroot/grokflow"
                    className="input flex-1 font-mono text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPath.trim()) {
                        setPaths([...paths, newPath.trim()]);
                        setNewPath("");
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newPath.trim()) {
                        setPaths([...paths, newPath.trim()]);
                        setNewPath("");
                      }
                    }}
                    className="btn-ghost p-1.5"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Mỗi path được tar -czf riêng với --ignore-failed-read. Để trống = không backup filesystem.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Postgres DB name (tuỳ chọn)</label>
              <input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="grokflow"
                className="input mt-1 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Worker sẽ chạy <code>sudo -u postgres pg_dump &lt;db&gt; | gzip</code>. Để trống = không backup DB.
              </p>
            </div>

            {data?.next_run_at && cron.trim() && (
              <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
                <Calendar size={12} /> Lần backup kế: {new Date(data.next_run_at).toLocaleString()}
              </div>
            )}
            {data?.last_backup_at && (
              <div className="text-[11px] text-slate-500">
                Lần backup gần nhất: {new Date(data.last_backup_at).toLocaleString()}
                {" · "}<span className={data.last_backup_status === "success" ? "text-emerald-600" : "text-rose-600"}>
                  {data.last_backup_status}
                </span>
                {data.last_backup_size_bytes && (
                  <> · {formatBytes(data.last_backup_size_bytes)}</>
                )}
                {data.last_backup_path && (
                  <code className="ml-1 text-[10px] text-slate-400">{data.last_backup_path}</code>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => runNow.mutate()}
                disabled={runNow.isPending || (!paths.length && !dbName.trim())}
                className="btn-secondary inline-flex items-center gap-1.5"
                title="Chạy backup ngay (đồng bộ — có thể mất vài phút)"
              >
                {runNow.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {runNow.isPending ? "Đang chạy..." : "Backup ngay"}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-ghost">Đóng</button>
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="btn-primary"
                >
                  {save.isPending ? "Đang lưu…" : "Lưu cấu hình"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
