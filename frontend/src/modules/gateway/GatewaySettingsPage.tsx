import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Wrench } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { ErrorPanel, extractError } from "./GatewayProfilesPage";

interface AutomationSettings {
  headless: boolean;
  concurrency: number;
  timeout_ms: number;
}
interface SettingsData {
  automation: AutomationSettings;
}

export function GatewaySettingsPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["gw-settings"],
    queryFn: async () => (await gatewayApi.get<SettingsData>("/api/settings")).data,
    retry: false,
  });

  const { register, handleSubmit, reset } = useForm<AutomationSettings>();

  useEffect(() => {
    if (data) reset(data.automation);
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: AutomationSettings) =>
      gatewayApi.put<SettingsData>("/api/settings", { automation: { ...v, concurrency: Number(v.concurrency), timeout_ms: Number(v.timeout_ms) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-settings"] });
      toast("Đã lưu settings", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  if (isLoading) return <p className="text-slate-500">Đang tải...</p>;
  if (error) return <ErrorPanel error={error} />;

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold flex items-center gap-2">
        <Wrench size={22} /> Gateway — Settings
      </h1>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="card space-y-3">
        <h2 className="font-semibold">Automation</h2>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("headless")} />
          <span>Headless (chạy Chromium không hiện UI)</span>
        </label>

        <div>
          <label className="text-sm font-medium">Concurrency (1-20)</label>
          <input className="input" type="number" min={1} max={20}
            {...register("concurrency", { valueAsNumber: true, required: true })} />
          <p className="text-xs text-slate-500 mt-1">
            Số job chạy song song trong job_runner.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Timeout (ms)</label>
          <input className="input" type="number" min={1000} max={600000}
            {...register("timeout_ms", { valueAsNumber: true, required: true })} />
          <p className="text-xs text-slate-500 mt-1">
            Timeout cho mỗi job automation. 120000 = 2 phút.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
