import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

import type {
  HistoryItem,
  TryImageResponse,
} from "../models/try-image";
import { tryImageService } from "../services/try-image.service";
import { MAX_HISTORY } from "../configs/try-image-data";
import { loadHistory, saveHistory } from "../utils/history";

import { TryImageTopNav } from "../components/TryImageTopNav";
import { TryImageHero } from "../components/TryImageHero";
import { TryImagePromptForm } from "../components/TryImagePromptForm";
import { TryImageResultCard } from "../components/TryImageResultCard";
import { TryImageErrorCard } from "../components/TryImageErrorCard";
import { TryImageHistorySection } from "../components/TryImageHistorySection";
import {
  ExamplePromptsCard,
  TipsCard,
  UpsellCard,
} from "../components/TryImageSidebar";
import { TryImageHowItWorksStrip } from "../components/TryImageHowItWorksStrip";
import { TryImageFaqStrip } from "../components/TryImageFaqStrip";
import { TryImageFooter } from "../components/TryImageFooter";

type TryResp = TryImageResponse;

/** Public Grok-Image "Try it" page.
 *
 *  Mapped to the landing page visual language (sticky nav + gradient brand,
 *  decorative blob hero, dark slate-900 footer). Reuses the same colour
 *  palette. Anonymous users get IP-rate-limited 2/24h tries; auth users
 *  fall into the regular plan quota path.
 */
export function TryImagePage() {
  const me = useAuthStore((s) => s.user);
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";
  const isAuth = !!me;

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [quality, setQuality] = useState<"speed" | "quality">("speed");
  const [job, setJob] = useState<TryResp | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  // Quota: shown above the form so user knows what they have left.
  const { data: quota, refetch: refetchQuota } = useQuery({
    queryKey: ["try-image-quota"],
    queryFn: () => tryImageService.quota(),
    staleTime: 10_000,
  });

  const submit = useMutation({
    mutationFn: () => tryImageService.submit({ prompt, aspect, quality }),
    onSuccess: (data) => {
      setJob(data);
      refetchQuota();
    },
  });

  // Poll until terminal.
  useEffect(() => {
    if (!job) return;
    if (["success", "failed", "cancelled"].includes(job.status)) {
      if (job.status === "success" && job.result_url) {
        // Persist completed images to local history so user sees them on
        // refresh without burning more quota.
        const next: HistoryItem = {
          job_id: job.job_id,
          prompt,
          result_url: job.result_url,
          aspect,
          ts: Date.now(),
        };
        const updated = [next, ...history.filter((h) => h.job_id !== next.job_id)].slice(0, MAX_HISTORY);
        setHistory(updated);
        saveHistory(updated);
      }
      return;
    }
    const t = setInterval(async () => {
      try {
        const data = await tryImageService.poll(job.job_id);
        setJob(data);
        if (["success", "failed", "cancelled"].includes(data.status)) {
          clearInterval(t);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(t);
  }, [job?.job_id, job?.status]);

  const remaining = quota?.remaining ?? (isAuth ? 999_999 : 2);
  const isExhausted = !isAuth && remaining <= 0;
  const submitDisabled =
    !prompt.trim() || submit.isPending || isExhausted ||
    (job ? !["success", "failed", "cancelled"].includes(job.status) : false);

  return (
    <div className="min-h-screen bg-white text-white flex flex-col">
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <TryImageTopNav brandName={brandName} isAuth={isAuth} email={me?.email} />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <TryImageHero quota={quota} isAuth={isAuth} />

      {/* ── Main grid: left = form/result · right = sidebar tips ──── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pb-16 -mt-4">
        <div className="grid lg:grid-cols-3 gap-5">
          {/* LEFT (2/3) — form + result */}
          <div className="lg:col-span-2 space-y-5">
            <TryImagePromptForm
              prompt={prompt} setPrompt={setPrompt}
              aspect={aspect} setAspect={setAspect}
              quality={quality} setQuality={setQuality}
              onSubmit={() => submit.mutate()}
              submitDisabled={submitDisabled}
              isPending={submit.isPending}
              isRendering={!!job && !["success", "failed", "cancelled"].includes(job.status)}
              remaining={remaining}
              isAuth={isAuth}
              isExhausted={isExhausted}
            />

            {submit.isError && <TryImageErrorCard error={submit.error as any} isAuth={isAuth} />}

            {job && (
              <TryImageResultCard
                job={job}
                prompt={prompt}
                onRetry={() => { setJob(null); submit.reset(); }}
              />
            )}

            {history.length > 0 && (
              <TryImageHistorySection items={history} onPick={(it) => {
                setPrompt(it.prompt);
                setAspect(it.aspect);
              }} onClear={() => { setHistory([]); saveHistory([]); }} />
            )}
          </div>

          {/* RIGHT (1/3) — example prompts + tips + upsell */}
          <aside className="space-y-5">
            <ExamplePromptsCard onPick={(p) => setPrompt(p)} />
            <TipsCard />
            {!isAuth && <UpsellCard />}
          </aside>
        </div>

        {/* Below-fold sections */}
        <TryImageHowItWorksStrip />
        <TryImageFaqStrip />
      </main>

      <TryImageFooter brandName={brandName} />
    </div>
  );
}
