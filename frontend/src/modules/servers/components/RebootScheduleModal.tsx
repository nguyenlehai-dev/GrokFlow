import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Calendar, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { monitoringService } from "../services/monitoring.service";


const CRON_PRESETS: { label: string; cron: string; hint: string }[] = [
  { label: "Tắt",                  cron: "",              hint: "Không tự reboot" },
  { label: "Mỗi Chủ nhật 03:00 UTC", cron: "0 3 * * 0",   hint: "= 10:00 sáng VN, Chủ nhật" },
  { label: "Hằng ngày 02:00 UTC",   cron: "0 2 * * *",    hint: "= 09:00 sáng VN" },
  { label: "Ngày 1 hằng tháng 02:00 UTC", cron: "0 2 1 * *", hint: "= 09:00 ngày 1 tháng VN" },
];


/** Modal: configure auto-reboot for one server.
 *
 *  Backend stores cron as a 5-field string in UTC. UI offers presets +
 *  custom input. `min_uptime_hours` guards against reboot loops when the
 *  monitor flaps. */
export function RebootScheduleModal({
  serverId, onClose,
}: { serverId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-server-reboot-schedule", serverId],
    queryFn: () => monitoringService.getRebootSchedule(serverId),
  });

  const [cron, setCron] = useState("");
  const [minUptime, setMinUptime] = useState(24);

  useEffect(() => {
    if (data) {
      setCron(data.cron ?? "");
      setMinUptime(data.min_uptime_hours);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => monitoringService.setRebootSchedule(serverId, {
      cron: cron.trim() || null,
      min_uptime_hours: minUptime,
    }),
    onSuccess: () => {
      toast("Đã lưu lịch reboot", "success");
      qc.invalidateQueries({ queryKey: ["admin-server-reboot-schedule", serverId] });
      onClose();
    },
    onError: (e: { response?: { data?: { detail?: { message?: string } } } }) =>
      toast(e?.response?.data?.detail?.message ?? "Lỗi lưu", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <RotateCcw size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Lịch auto-reboot</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-slate-500">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Đang tải…
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-slate-700">Cron string (UTC)</label>
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 3 * * 0"
                className="input mt-1 font-mono"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setCron(p.cron)}
                    className={`text-[11px] px-2 py-1 rounded-full ring-1 transition-colors ${
                      cron.trim() === p.cron
                        ? "bg-blue-100 text-blue-700 ring-blue-300"
                        : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200"
                    }`}
                    title={p.hint}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Format: <code>min hour day month weekday</code> · để trống = tắt auto-reboot
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Min uptime (giờ)</label>
              <input
                type="number"
                min={0}
                max={720}
                value={minUptime}
                onChange={(e) => setMinUptime(Number(e.target.value) || 0)}
                className="input mt-1"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Bỏ qua reboot nếu server mới khởi động lại trong N giờ. Chặn reboot loop.
              </p>
            </div>

            {data?.next_run_at && cron.trim() && (
              <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                <Calendar size={12} /> Lần reboot kế: {new Date(data.next_run_at).toLocaleString()}
              </div>
            )}
            {data?.last_reboot_at && (
              <div className="text-[11px] text-slate-500">
                Lần reboot gần nhất: {new Date(data.last_reboot_at).toLocaleString()}
                {" · "}{data.last_reboot_trigger}
                {" · "}<span className={data.last_reboot_status === "success" ? "text-emerald-600" : "text-rose-600"}>
                  {data.last_reboot_status}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="btn-ghost">Huỷ</button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="btn-primary"
              >
                {save.isPending ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
