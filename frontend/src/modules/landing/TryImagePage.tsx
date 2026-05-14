import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sparkles, ImageIcon, Loader2, AlertTriangle, LogIn, Download,
  RefreshCw, Wand2, Crown,
} from "lucide-react";
import axios from "axios";

import { useAuthStore } from "@/core/auth/store";

/** Public "Try image" page — Grok-style minimal UI. Anonymous users get
 *  N free generations per IP per 24h (counter on backend Redis); auth'd
 *  users go through plan quotas. Server picks the runner profile.
 *
 *  Route: /try/image (no auth required). Header dropdown links here. */

interface TryResp {
  job_id: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  remaining_today: number;
  is_anon: boolean;
}

interface QuotaResp {
  is_anon: boolean;
  daily_cap: number;
  used_today: number;
  remaining: number;
}

const ASPECTS = [
  { v: "1:1", label: "Vuông" },
  { v: "16:9", label: "Ngang" },
  { v: "9:16", label: "Dọc" },
  { v: "4:3", label: "4:3" },
  { v: "3:4", label: "3:4" },
];

export function TryImagePage() {
  const me = useAuthStore((s) => s.user);
  const isAuth = !!me;

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [quality, setQuality] = useState<"speed" | "quality">("speed");
  const [job, setJob] = useState<TryResp | null>(null);

  // Quota: shown above the form so user knows what they have left.
  const { data: quota, refetch: refetchQuota } = useQuery({
    queryKey: ["try-image-quota"],
    queryFn: async () =>
      (await axios.get<QuotaResp>("/api/public/try-image/quota")).data,
    staleTime: 10_000,
  });

  // Submit job → backend returns job_id immediately; we then poll until
  // status leaves queued/running.
  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<TryResp>("/api/public/try-image", {
        prompt,
        aspect,
        quality,
      });
      return data;
    },
    onSuccess: (data) => {
      setJob(data);
      refetchQuota();
    },
  });

  // Poll job status every 3s while not terminal.
  useEffect(() => {
    if (!job) return;
    if (["success", "failed", "cancelled"].includes(job.status)) return;
    const t = setInterval(async () => {
      try {
        const { data } = await axios.get<TryResp>(`/api/public/try-image/${job.job_id}`);
        setJob(data);
        if (["success", "failed", "cancelled"].includes(data.status)) {
          clearInterval(t);
        }
      } catch {
        // network blip — keep trying until terminal
      }
    }, 3000);
    return () => clearInterval(t);
  }, [job?.job_id, job?.status]);

  const remaining = quota?.remaining ?? (isAuth ? 999_999 : 2);
  const isExhausted = !isAuth && remaining <= 0;
  const submitDisabled =
    !prompt.trim() || submit.isPending || isExhausted ||
    (job ? !["success", "failed", "cancelled"].includes(job.status) : false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50 to-fuchsia-50">
      {/* Top nav */}
      <nav className="border-b border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/landing" className="font-semibold text-lg text-slate-800 inline-flex items-center gap-1.5">
            <Wand2 size={18} className="text-violet-600" /> GrokFlow
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/pricing" className="text-slate-600 hover:text-violet-600">Bảng giá</Link>
            {isAuth ? (
              <Link to="/dashboard" className="btn-primary text-sm">Vào Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-slate-600 hover:text-violet-600">Đăng nhập</Link>
                <Link to="/register" className="btn-primary text-sm">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-wider text-violet-600 font-semibold">
            <Sparkles className="inline" size={12} /> Thử miễn phí · Không cần đăng ký
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Tạo ảnh bằng <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-600">Grok Imagine</span>
          </h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            Nhập mô tả → bấm tạo. Anonymous được dùng thử <strong>2 ảnh/ngày</strong>.
            Đăng ký để nâng quota theo gói.
          </p>
        </div>

        {/* Quota banner */}
        <QuotaBanner quota={quota} isAuth={isAuth} />

        {/* Form */}
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-sm space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Mô tả ảnh (prompt)</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A dragon flying over Ha Long Bay at sunset, watercolor style, cinematic lighting"
              maxLength={2000}
            />
            <span className="text-xs text-slate-400 mt-0.5 block">
              {prompt.length}/2000 ký tự
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-medium text-slate-700">Khung hình</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ASPECTS.map((a) => (
                  <button
                    key={a.v}
                    type="button"
                    onClick={() => setAspect(a.v)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition ${
                      aspect === a.v
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {a.v} <span className="opacity-70">· {a.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="font-medium text-slate-700">Chất lượng</span>
              <div className="mt-1 flex gap-1.5">
                {[
                  { v: "speed", label: "Nhanh" },
                  { v: "quality", label: "Cao" },
                ].map((q) => (
                  <button
                    key={q.v}
                    type="button"
                    onClick={() => setQuality(q.v as any)}
                    className={`px-3 py-1 text-xs font-medium rounded-md border transition ${
                      quality === q.v
                        ? "bg-fuchsia-600 text-white border-fuchsia-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {isAuth ? (
                <>Dùng quota của gói <strong>{me?.role}</strong></>
              ) : (
                <>Còn lại <strong className="text-violet-700">{remaining}</strong> lần thử miễn phí</>
              )}
            </p>
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submitDisabled}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {submit.isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Đang gửi...</>
              ) : job && !["success", "failed", "cancelled"].includes(job.status) ? (
                <><Loader2 size={14} className="animate-spin" /> Đang render...</>
              ) : (
                <><Sparkles size={14} /> Tạo ảnh</>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {submit.isError && (
          <ErrorCard error={submit.error as any} isAuth={isAuth} />
        )}

        {/* Result */}
        {job && <ResultCard job={job} onRetry={() => { setJob(null); submit.reset(); }} />}

        {/* CTA */}
        {!isAuth && (
          <div className="rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-5 text-center shadow-lg">
            <Crown className="inline" size={20} />
            <h3 className="text-lg font-bold mt-1">Thích kết quả? Nâng cấp để dùng không giới hạn</h3>
            <p className="text-sm opacity-90 mt-1">
              Pro: 200 ảnh + 200 video / ngày · Aspect đầy đủ · API + Webhook
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/pricing" className="inline-flex items-center gap-1.5 rounded-md bg-white text-violet-700 px-4 py-2 text-sm font-semibold hover:bg-violet-50">
                Xem bảng giá
              </Link>
              <Link to="/register" className="inline-flex items-center gap-1.5 rounded-md bg-white/20 backdrop-blur-sm text-white px-4 py-2 text-sm font-semibold border border-white/40 hover:bg-white/30">
                <LogIn size={14} /> Đăng ký
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub ───────────────────────────────────────────────────────────────────

function QuotaBanner({ quota, isAuth }: { quota: QuotaResp | undefined; isAuth: boolean }) {
  if (!quota) return null;
  const pct = quota.daily_cap > 0 ? (quota.used_today / quota.daily_cap) * 100 : 0;
  const exhausted = quota.remaining <= 0 && !isAuth;
  return (
    <div className={`rounded-lg p-3 text-sm ring-1 ${
      exhausted ? "bg-rose-50 ring-rose-200 text-rose-900"
        : "bg-white ring-slate-200 text-slate-700"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {exhausted
            ? <AlertTriangle size={16} className="text-rose-500" />
            : <ImageIcon size={16} className="text-violet-500" />}
          <span>
            {isAuth ? (
              <>Quota gói: <strong>{quota.daily_cap || "∞"}</strong> ảnh/ngày</>
            ) : exhausted ? (
              <>Đã hết lượt thử miễn phí trong 24h — <Link to="/register" className="underline font-medium">đăng ký miễn phí</Link> để tiếp tục</>
            ) : (
              <>Còn <strong>{quota.remaining}</strong>/{quota.daily_cap} lượt thử miễn phí trong 24h</>
            )}
          </span>
        </div>
        {!isAuth && quota.daily_cap > 0 && (
          <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full ${exhausted ? "bg-rose-500" : "bg-violet-500"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ error, isAuth }: { error: any; isAuth: boolean }) {
  const detail = error?.response?.data?.detail;
  const code = detail?.code;
  const msg = detail?.message ?? error?.message ?? "Có lỗi xảy ra";
  const isQuotaError = code === "anon_quota_exhausted";

  return (
    <div className="rounded-lg p-4 bg-rose-50 ring-1 ring-rose-200 flex items-start gap-3">
      <AlertTriangle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-rose-900">
          {isQuotaError ? "Hết lượt thử miễn phí" : "Không tạo được ảnh"}
        </p>
        <p className="text-sm text-rose-800 mt-0.5">{msg}</p>
        {isQuotaError && !isAuth && (
          <Link to="/register" className="inline-block mt-2 text-sm font-medium text-violet-700 underline">
            Đăng ký tài khoản → nhận quota cao hơn
          </Link>
        )}
      </div>
    </div>
  );
}

function ResultCard({ job, onRetry }: { job: TryResp; onRetry: () => void }) {
  const isDone = job.status === "success" && !!job.result_url;
  const isFailed = job.status === "failed" || job.status === "cancelled";
  const isPending = !isDone && !isFailed;

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <ImageIcon size={16} className="text-violet-600" /> Kết quả
        </h3>
        <code className="text-[10px] font-mono text-slate-400">{job.job_id.slice(0, 8)}</code>
      </div>

      {isPending && (
        <div className="rounded-lg bg-gradient-to-br from-slate-100 to-violet-100 aspect-square max-w-md mx-auto flex items-center justify-center">
          <div className="text-center text-slate-600">
            <Loader2 size={32} className="mx-auto animate-spin text-violet-500" />
            <p className="text-sm mt-2">Đang render — 15-30s tuỳ tải</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">status={job.status}</p>
          </div>
        </div>
      )}

      {isDone && (
        <>
          <img
            src={job.result_url!}
            alt="Generated"
            className="rounded-lg max-w-full mx-auto shadow-md"
          />
          <div className="flex justify-center gap-2 mt-3">
            <a
              href={job.result_url!}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
            >
              <Download size={14} /> Tải về
            </a>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium"
            >
              <RefreshCw size={14} /> Tạo ảnh khác
            </button>
          </div>
        </>
      )}

      {isFailed && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-900">
          <p className="font-semibold">Render thất bại</p>
          <p className="text-xs text-rose-700 mt-1">{job.error_message || "Hệ thống bận, thử lại sau."}</p>
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white text-rose-700 text-xs font-medium hover:bg-rose-100 ring-1 ring-rose-200"
          >
            <RefreshCw size={12} /> Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
