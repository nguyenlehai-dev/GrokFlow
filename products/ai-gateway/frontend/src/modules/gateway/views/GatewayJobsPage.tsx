import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Activity, Plus, RefreshCw, RotateCw } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { extractError } from "../utils/common";
import { jobsService } from "../services/jobs.service";
import { profilesService } from "../services/profiles.service";
import type { ProfileRef } from "../models/profile";

export function GatewayJobsPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: jobs, isLoading, error, refetch } = useQuery({
    queryKey: ["gw-jobs"],
    queryFn: () => jobsService.list(),
    retry: false,
    refetchInterval: 5000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => jobsService.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-jobs"] });
      toast(t("gateway.gw_jobs_retry_queued"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Activity size={22} /> {t("gateway.gw_jobs_title")}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost text-xs">
            <RefreshCw size={12} className="inline mr-1" /> {t("gateway.gw_jobs_refresh")}
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} /> {t("gateway.gw_jobs_create_btn")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_jobs_loading")}</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_id")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_profile")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_target")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_prompt")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_count")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_status")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_created")}</th>
                <th className="px-3 py-2">{t("gateway.gw_jobs_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id} className="border-t hover:bg-white">
                  <td className="px-3 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{j.profile_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{j.target}</td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="truncate" title={j.prompt}>{j.prompt}</div>
                    {j.error_message && (
                      <div className="text-xs text-rose-600 truncate" title={j.error_message}>
                        ⚠ {j.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{j.count}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(j.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {(j.status === "failed" || j.status === "succeeded") && (
                      <button
                        onClick={() => retry.mutate(j.id)}
                        className="btn-ghost text-xs"
                        title={t("gateway.gw_jobs_retry_title")}
                      >
                        <RotateCw size={12} className="inline mr-1" /> {t("gateway.gw_jobs_retry_btn")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    {t("gateway.gw_jobs_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateJobModal onClose={() => setCreating(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["gw-jobs"] });
        setCreating(false);
      }} />}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "completed" || status === "success" ? "bg-emerald-100 text-emerald-700"
    : status === "running" || status === "processing" ? "bg-blue-100 text-blue-700"
    : status === "failed" || status === "error" ? "bg-rose-100 text-rose-700"
    : status === "queued" || status === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}

function CreateJobModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { data: profiles } = useQuery<ProfileRef[]>({
    queryKey: ["gw-profiles"],
    queryFn: () => profilesService.list(),
    retry: false,
  });
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      profile_id: "",
      target: "image",
      prompt: "",
      negative_prompt: "",
      count: 1,
    },
  });
  const profileId = watch("profile_id");
  const selectedProfile = profiles?.find((p) => p.id === profileId);

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        profile_id: v.profile_id,
        target: v.target,
        prompt: v.prompt,
        negative_prompt: v.negative_prompt || null,
        count: Number(v.count),
      };
      return jobsService.create(payload);
    },
    onSuccess: () => {
      toast(t("gateway.gw_jobs_created"), "success");
      onCreated();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">{t("gateway.gw_jobs_modal_title")}</h2>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_jobs_field_profile")}</label>
          <select className="input" {...register("profile_id", { required: true })}>
            <option value="">{t("gateway.gw_jobs_field_select")}</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_jobs_field_target")}</label>
            <select className="input" {...register("target")}>
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
            {selectedProfile && (
              <p className="text-xs text-slate-500 mt-1">
                {t("gateway.gw_jobs_profile_category")} <code>{selectedProfile.category}</code>
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_jobs_field_count")}</label>
            <input className="input" type="number" min={1} max={10}
              {...register("count", { valueAsNumber: true })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_jobs_field_prompt")}</label>
          <textarea className="input" rows={3} {...register("prompt", { required: true })} />
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_jobs_field_negative")}</label>
          <input className="input" {...register("negative_prompt")} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_jobs_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_jobs_creating") : t("gateway.gw_jobs_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
