// ─── Result card ──────────────────────────────────────────────────────────
import { useState } from "react";
import {
  ImageIcon, Loader2, AlertTriangle, Download, RefreshCw, Check, Copy,
} from "lucide-react";

import type { TryImageResponse } from "../models/try-image";

type TryResp = TryImageResponse;

export function TryImageResultCard({
  job, prompt, onRetry,
}: { job: TryResp; prompt: string; onRetry: () => void }) {
  const isDone = job.status === "success" && !!job.result_url;
  const isFailed = job.status === "failed" || job.status === "cancelled";
  const isPending = !isDone && !isFailed;

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2">
          <ImageIcon size={16} className="text-violet-600" /> Kết quả
        </h3>
        <code className="text-[10px] font-mono text-slate-9000">
          {job.job_id.slice(0, 8)} · {job.status}
        </code>
      </div>

      {isPending && (
        <div className="rounded-xl bg-gradient-to-br from-violet-100 via-fuchsia-100 to-rose-100 aspect-square max-w-md mx-auto flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,white,transparent_70%)] opacity-50 animate-pulse" />
          <div className="text-center text-slate-700 relative z-10">
            <Loader2 size={36} className="mx-auto animate-spin text-violet-500" />
            <p className="text-sm mt-3 font-medium">Đang render bằng Grok Imagine</p>
            <p className="text-xs text-slate-500 mt-1">15-30s tuỳ tải · status={job.status}</p>
          </div>
        </div>
      )}

      {isDone && (
        <>
          <div className="rounded-xl overflow-hidden bg-slate-100 shadow-lg">
            <img
              src={job.result_url!}
              alt={prompt}
              className="w-full h-auto block"
            />
          </div>
          <div className="flex justify-between items-center gap-2 mt-3 flex-wrap">
            <p className="text-xs text-slate-500 italic truncate max-w-md">"{prompt}"</p>
            <div className="flex gap-2 flex-shrink-0">
              <CopyPromptButton text={prompt} />
              <a
                href={job.result_url!}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
              >
                <Download size={14} /> Tải về
              </a>
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-sm font-medium"
              >
                <RefreshCw size={14} /> Tạo khác
              </button>
            </div>
          </div>
        </>
      )}

      {isFailed && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-4 text-sm text-rose-900">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <AlertTriangle size={14} /> Render thất bại
          </p>
          <p className="text-xs text-rose-700 mt-1">{job.error_message || "Hệ thống bận, thử lại sau."}</p>
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-rose-700 text-xs font-medium hover:bg-rose-100 ring-1 ring-rose-200"
          >
            <RefreshCw size={12} /> Thử lại
          </button>
        </div>
      )}
    </div>
  );
}

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
      title="Copy prompt"
    >
      {copied ? <><Check size={14} className="text-emerald-600" /> Đã copy</> : <><Copy size={14} /> Copy prompt</>}
    </button>
  );
}
