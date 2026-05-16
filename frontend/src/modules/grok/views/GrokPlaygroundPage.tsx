import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, KeyRound, X, Loader2, ChevronRight } from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useGrokKey } from "../stores/grokKeyStore";
import { GrokKeyLockModal } from "../components/GrokKeyLockModal";
import type { JobOut } from "../models/job";
import { jobsService } from "../services/jobs.service";
import { PLAYGROUND_ASPECTS, QUALITIES } from "../configs/aspects";
import { aspectToSize } from "../utils/aspect";

/** Grok Playground — verified-key gated UI for submitting jobs as if
 *  from an external integration. Admin bypasses the lock; everyone else
 *  must verify an API key first.
 *
 *  Submitted jobs use the verified key as Bearer (not the user's JWT)
 *  so they land under the key's owner. That matches the external API
 *  surface 1:1 — what you do here is the same call third-party code
 *  would make against /api/jobs.
 */

export function GrokPlaygroundPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const verified = useGrokKey((s) => s.current);
  const clear = useGrokKey((s) => s.clear);
  const domainConfig = useDomainStore((s) => s.config);
  // Only super_admin bypasses the API-key gate — domain admins are
  // tenants and go through the same auth path as third-party callers.
  // Domain-level toggle on `/admin/domains` can disable the gate.
  const isSuper = me?.role === "super_admin";
  const gateRequired = domainConfig?.require_playground_key ?? true;
  const locked = gateRequired && !isSuper && !verified;

  return (
    <div className="relative space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity size={22} className="text-violet-600" /> {t("grok.playground_title")}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("grok.playground_subtitle")}
          </p>
        </div>
        {verified && (
          <KeyStatusChip
            label={verified.label}
            usedToday={verified.used_today}
            dailyLimit={verified.daily_limit}
            onClear={() => {
              clear();
              toast(t("grok.playground_key_cleared"), "info");
            }}
          />
        )}
      </header>

      {locked && <GrokKeyLockModal />}

      <PlaygroundForm bearer={verified?.key ?? null} isAdmin={isSuper} />
    </div>
  );
}

function KeyStatusChip({
  label, usedToday, dailyLimit, onClear,
}: {
  label: string;
  usedToday: number | null;
  dailyLimit: number | null;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const pct = usedToday != null && dailyLimit != null && dailyLimit > 0
    ? Math.round((usedToday / dailyLimit) * 100)
    : null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs">
      <KeyRound size={12} className="text-violet-600" />
      <span className="font-mono text-violet-700">{label || t("grok.playground_no_label")}</span>
      {usedToday != null && dailyLimit != null && (
        <span className="text-violet-600">
          {usedToday}/{dailyLimit}
          {pct != null && pct >= 80 && (
            <span className="ml-1 text-rose-600 font-semibold">!</span>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="text-violet-400 hover:text-rose-600"
        title={t("grok.playground_change_key")}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function PlaygroundForm({ bearer, isAdmin }: { bearer: string | null; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [jobType, setJobType] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [quality, setQuality] = useState("speed");
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [duration, setDuration] = useState(6);
  const [result, setResult] = useState<JobOut | null>(null);

  // For admin without a Bearer (no key needed when isAdmin), we fall back
  // to the regular axios instance (JWT-authed). For non-admin verified
  // users we build a one-off axios instance with their Bearer key so the
  // job lands under the key's owner.
  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        provider: "grok",
        job_type: jobType,
        prompt,
        profile_id: null,
        options: jobType === "image"
          ? { aspect, size: aspectToSize(aspect), n: 1, quality }
          : { aspect, resolution, duration, n: 1 },
      };
      if (bearer && !isAdmin) {
        return jobsService.submitWithKey(bearer, body);
      }
      // Admin path or unauthenticated bearer-less request — use main axios.
      return jobsService.submit(body);
    },
    onSuccess: (data) => {
      setResult(data);
      toast(t("grok.playground_submit_success"), "success");
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message || t("grok.playground_submit_failed");
      toast(msg, "error");
    },
  });

  return (
    <>
      <div className="card space-y-4 p-4">
        <h2 className="font-semibold">{t("grok.playground_submit_job")}</h2>

        <div className="flex gap-2 text-sm">
          {(["image", "video"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setJobType(kind)}
              className={`px-3 py-1.5 rounded-md border transition ${
                jobType === kind
                  ? "bg-violet-50 border-violet-500 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:bg-white"
              }`}
            >
              {kind === "image" ? t("grok.playground_image") : t("grok.playground_video")}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">{t("grok.playground_prompt")}</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={jobType === "image"
              ? t("grok.playground_prompt_placeholder_image")
              : t("grok.playground_prompt_placeholder_video")}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            rows={3}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="block">
            <span className="font-medium text-slate-700">{t("grok.playground_aspect")}</span>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="input mt-1 w-full"
            >
              {PLAYGROUND_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {jobType === "image" ? (
            <label className="block">
              <span className="font-medium text-slate-700">{t("grok.playground_quality")}</span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="input mt-1 w-full"
              >
                {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="font-medium text-slate-700">{t("grok.playground_resolution")}</span>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as "480p" | "720p")}
                  className="input mt-1 w-full"
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <label className="block">
                <span className="font-medium text-slate-700">{t("grok.playground_duration")}</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="input mt-1 w-full"
                >
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!prompt.trim() || submit.isPending}
            className="btn-primary inline-flex items-center gap-2"
          >
            {submit.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> {t("grok.playground_submitting")}</>
            ) : (
              <>{t("grok.playground_submit")} <ChevronRight size={14} /></>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="card space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <RefreshCw size={14} /> {t("grok.playground_last_submission")}
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <code className="font-mono text-xs">{result.id.slice(0, 8)}</code>
            <StatusBadge status={result.status} />
            <span className="text-slate-500">{result.job_type}</span>
          </div>
          <p className="text-xs text-slate-500">
            {t("grok.playground_queued_prefix")}{" "}
            <a href="/grok/jobs" className="text-violet-600 hover:underline">/grok/jobs</a>.
          </p>
        </div>
      )}
    </>
  );
}

