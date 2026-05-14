import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Sparkles, ImageIcon, Loader2, AlertTriangle, LogIn, Download,
  RefreshCw, Wand2, Crown, ArrowRight, Lightbulb, Zap, History,
  Lock, Check, Star, BookOpen, X, Copy, CheckCircle2,
} from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

/** Public Grok-Image "Try it" page.
 *
 *  Mapped to the landing page visual language (sticky nav + gradient brand,
 *  decorative blob hero, dark slate-900 footer). Reuses the same colour
 *  palette. Anonymous users get IP-rate-limited 2/24h tries; auth users
 *  fall into the regular plan quota path.
 */

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
  { v: "1:1",  label: "Vuông",  icon: "■" },
  { v: "16:9", label: "Ngang",  icon: "▭" },
  { v: "9:16", label: "Dọc",    icon: "▯" },
  { v: "4:3",  label: "4:3",    icon: "▭" },
  { v: "3:4",  label: "3:4",    icon: "▯" },
];

// Curated starter prompts. Click → fills the prompt field so first-time
// visitors don't bounce on empty-state paralysis.
const PROMPT_EXAMPLES = [
  {
    emoji: "🐉",
    label: "Rồng + Vịnh Hạ Long",
    prompt: "A majestic dragon flying over Ha Long Bay at golden sunset, watercolor style, cinematic lighting, ultra detailed",
  },
  {
    emoji: "🌆",
    label: "Cyberpunk Saigon",
    prompt: "Cyberpunk Saigon street at night, neon lights reflecting on wet pavement, motorbikes blurring past, photorealistic 8k",
  },
  {
    emoji: "🎨",
    label: "Chân dung anime",
    prompt: "Anime portrait of a young Vietnamese girl wearing áo dài in cherry blossom garden, soft studio lighting, Makoto Shinkai style",
  },
  {
    emoji: "🏯",
    label: "Đền cổ trong rừng",
    prompt: "Ancient Vietnamese temple hidden in misty jungle, dawn light filtering through trees, mossy stone steps, atmospheric photography",
  },
  {
    emoji: "🍜",
    label: "Phở nghệ thuật",
    prompt: "Hyperrealistic bowl of phở with steam rising, dramatic side lighting, food photography, shallow depth of field, professional",
  },
  {
    emoji: "🚀",
    label: "Phi hành gia surfer",
    prompt: "An astronaut surfing on a cosmic wave through purple nebula, retro 80s synthwave aesthetic, vibrant colors, poster art",
  },
];

const STORAGE_HISTORY_KEY = "grokflow:try-image:history";
const MAX_HISTORY = 6;

interface HistoryItem {
  job_id: string;
  prompt: string;
  result_url: string;
  aspect: string;
  ts: number;
}

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
    queryFn: async () =>
      (await axios.get<QuotaResp>("/api/public/try-image/quota")).data,
    staleTime: 10_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<TryResp>("/api/public/try-image", {
        prompt, aspect, quality,
      });
      return data;
    },
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
        const { data } = await axios.get<TryResp>(`/api/public/try-image/${job.job_id}`);
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
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <TopNav brandName={brandName} isAuth={isAuth} email={me?.email} />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <Hero quota={quota} isAuth={isAuth} />

      {/* ── Main grid: left = form/result · right = sidebar tips ──── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pb-16 -mt-4">
        <div className="grid lg:grid-cols-3 gap-5">
          {/* LEFT (2/3) — form + result */}
          <div className="lg:col-span-2 space-y-5">
            <PromptForm
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

            {submit.isError && <ErrorCard error={submit.error as any} isAuth={isAuth} />}

            {job && (
              <ResultCard
                job={job}
                prompt={prompt}
                onRetry={() => { setJob(null); submit.reset(); }}
              />
            )}

            {history.length > 0 && (
              <HistorySection items={history} onPick={(it) => {
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
        <HowItWorksStrip />
        <FaqStrip />
      </main>

      <Footer brandName={brandName} />
    </div>
  );
}

// ─── Top nav ───────────────────────────────────────────────────────────────

function TopNav({ brandName, isAuth, email }: { brandName: string; isAuth: boolean; email?: string | null }) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-lg border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/landing" className="text-xl font-bold inline-flex items-center gap-1.5">
          <Wand2 size={22} className="text-violet-600" />
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            {brandName}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
          <Link to="/landing#modules" className="hover:text-violet-600">Tính năng</Link>
          <Link to="/pricing" className="hover:text-violet-600">Bảng giá</Link>
          <Link to="/landing#faq" className="hover:text-violet-600">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          {isAuth ? (
            <>
              <span className="text-xs text-slate-500 hidden sm:inline">{email}</span>
              <Link to="/dashboard" className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold">
                Dashboard <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900 px-2.5 py-1.5 hidden sm:inline">
                Đăng nhập
              </Link>
              <Link to="/register" className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 shadow-sm">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

function Hero({ quota, isAuth }: { quota: QuotaResp | undefined; isAuth: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl" />
        <div className="absolute -top-12 right-0 w-[28rem] h-[28rem] bg-fuchsia-300/30 rounded-full blur-3xl" />
      </div>
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-10 sm:pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-200 bg-white/80 backdrop-blur-sm text-violet-700 text-xs font-semibold">
          <Star size={12} className="text-amber-500" />
          {isAuth ? "Logged in · Plan quota" : "Public preview · 2 ảnh miễn phí mỗi ngày"}
        </span>
        <h1 className="mt-5 text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight max-w-3xl mx-auto">
          Tạo ảnh AI bằng{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
            Grok Imagine
          </span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-xl mx-auto">
          Gõ mô tả ảnh bằng tiếng Việt hoặc tiếng Anh → bấm tạo → tải về. Không cần
          đăng ký, không cần thẻ.
        </p>
        {quota && <HeroQuotaBadge quota={quota} isAuth={isAuth} />}
      </div>
    </section>
  );
}

function HeroQuotaBadge({ quota, isAuth }: { quota: QuotaResp; isAuth: boolean }) {
  const exhausted = quota.remaining <= 0 && !isAuth;
  return (
    <div className="mt-6 inline-flex items-center gap-2 text-sm">
      {isAuth ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
          <CheckCircle2 size={14} />
          Đang dùng quota gói — không giới hạn ở /try/image
        </span>
      ) : exhausted ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
          <Lock size={14} />
          Đã hết lượt thử miễn phí · <Link to="/register" className="underline font-semibold">Đăng ký để tiếp tục</Link>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-violet-200 text-slate-700 shadow-sm">
          <Sparkles size={14} className="text-violet-500" />
          Còn <strong className="text-violet-700">{quota.remaining}</strong>/{quota.daily_cap} lượt miễn phí · reset sau 24h
        </span>
      )}
    </div>
  );
}

// ─── Prompt form ──────────────────────────────────────────────────────────

function PromptForm({
  prompt, setPrompt, aspect, setAspect, quality, setQuality,
  onSubmit, submitDisabled, isPending, isRendering, remaining, isAuth, isExhausted,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  aspect: string;
  setAspect: (v: string) => void;
  quality: "speed" | "quality";
  setQuality: (v: "speed" | "quality") => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  isPending: boolean;
  isRendering: boolean;
  remaining: number;
  isAuth: boolean;
  isExhausted: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 sm:p-6 ring-1 ring-slate-200 shadow-sm">
      <label className="block">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
            <Sparkles size={14} className="text-violet-500" /> Mô tả ảnh (prompt)
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {prompt.length}/2000
          </span>
        </div>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm font-mono outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition resize-none"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ví dụ: A dragon flying over Ha Long Bay at sunset, watercolor style, cinematic lighting"
          maxLength={2000}
        />
      </label>

      {/* Aspect chips */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Khung hình</p>
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.v}
              type="button"
              onClick={() => setAspect(a.v)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition ${
                aspect === a.v
                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="font-mono">{a.v}</span>
              <span className="opacity-70 ml-1">· {a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quality chips */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Chất lượng</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setQuality("speed")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center justify-center gap-1.5 transition ${
              quality === "speed"
                ? "bg-fuchsia-600 text-white border-fuchsia-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Zap size={14} /> Nhanh (~15s)
          </button>
          <button
            type="button"
            onClick={() => setQuality("quality")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center justify-center gap-1.5 transition ${
              quality === "quality"
                ? "bg-fuchsia-600 text-white border-fuchsia-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Crown size={14} /> Cao (~45s)
          </button>
        </div>
      </div>

      {/* Submit row */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          {isAuth ? (
            <span className="inline-flex items-center gap-1">
              <Check size={12} className="text-emerald-500" /> Dùng quota gói
            </span>
          ) : isExhausted ? (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <Lock size={12} /> Đã hết — <Link to="/register" className="underline">đăng ký</Link> để tiếp tục
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} className="text-violet-500" />
              Còn <strong className="text-violet-700">{remaining}</strong> lượt miễn phí
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-2.5 text-sm font-semibold shadow-md hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Đang gửi…</>
          ) : isRendering ? (
            <><Loader2 size={14} className="animate-spin" /> Đang render…</>
          ) : (
            <><Sparkles size={14} /> Tạo ảnh</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────

function ResultCard({
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
        <code className="text-[10px] font-mono text-slate-400">
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

// ─── Error card ───────────────────────────────────────────────────────────

function ErrorCard({ error, isAuth }: { error: any; isAuth: boolean }) {
  const detail = error?.response?.data?.detail;
  const code = detail?.code;
  const msg = detail?.message ?? error?.message ?? "Có lỗi xảy ra";
  const isQuotaError = code === "anon_quota_exhausted";

  return (
    <div className="rounded-2xl p-5 bg-rose-50 ring-1 ring-rose-200 flex items-start gap-3">
      <AlertTriangle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-rose-900">
          {isQuotaError ? "Hết lượt thử miễn phí" : "Không tạo được ảnh"}
        </p>
        <p className="text-sm text-rose-800 mt-0.5">{msg}</p>
        {isQuotaError && !isAuth && (
          <Link
            to="/register"
            className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-violet-700 hover:text-violet-800"
          >
            Đăng ký tài khoản → nhận quota cao hơn <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── History (anonymous, localStorage) ────────────────────────────────────

function HistorySection({
  items, onPick, onClear,
}: { items: HistoryItem[]; onPick: (it: HistoryItem) => void; onClear: () => void }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2">
          <History size={16} className="text-cyan-600" /> Lịch sử (local)
        </h3>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-rose-600">
          Xóa lịch sử
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {items.map((it) => (
          <button
            key={it.job_id}
            onClick={() => onPick(it)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 hover:ring-2 hover:ring-violet-500 transition"
            title={it.prompt}
          >
            <img src={it.result_url} alt={it.prompt} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition">
              <p className="text-[10px] text-white truncate">{it.prompt}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        Lưu trong trình duyệt của bạn · không sync · click để load lại prompt
      </p>
    </div>
  );
}

// ─── Sidebar cards ────────────────────────────────────────────────────────

function ExamplePromptsCard({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-200">
      <h3 className="font-semibold text-slate-800 inline-flex items-center gap-1.5 mb-2">
        <Lightbulb size={16} className="text-amber-500" /> Prompt mẫu
      </h3>
      <p className="text-xs text-slate-600 mb-3">
        Bí ý tưởng? Bấm để dùng:
      </p>
      <ul className="space-y-1.5">
        {PROMPT_EXAMPLES.map((p) => (
          <li key={p.label}>
            <button
              onClick={() => onPick(p.prompt)}
              className="w-full text-left text-sm rounded-md bg-white hover:bg-violet-100 px-3 py-2 transition flex items-center gap-2"
            >
              <span className="text-base">{p.emoji}</span>
              <span className="font-medium text-slate-700 flex-1">{p.label}</span>
              <ArrowRight size={12} className="text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipsCard() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-800 inline-flex items-center gap-1.5 mb-2">
        <BookOpen size={16} className="text-cyan-600" /> Prompt hay
      </h3>
      <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
        <li><strong className="text-slate-800">Cụ thể hơn</strong> luôn tốt hơn. "Mèo" → "mèo Anh lông ngắn, mắt xanh, nằm trên ghế velvet đỏ".</li>
        <li><strong className="text-slate-800">Thêm style</strong>: watercolor, oil painting, photorealistic, anime, 3D render, pixel art.</li>
        <li><strong className="text-slate-800">Thêm lighting</strong>: golden hour, neon, dramatic side lighting, soft studio.</li>
        <li><strong className="text-slate-800">Tỷ lệ phù hợp</strong>: 16:9 cho landscape, 9:16 cho mobile, 1:1 cho avatar.</li>
        <li><strong className="text-slate-800">English thường ra tốt hơn</strong> tiếng Việt vì model train chủ yếu tiếng Anh.</li>
      </ul>
    </div>
  );
}

function UpsellCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-5 shadow-lg">
      <Crown size={20} className="text-amber-200" />
      <h3 className="font-bold mt-2">Cần dùng nhiều hơn?</h3>
      <p className="text-xs opacity-90 mt-1 leading-relaxed">
        Đăng ký miễn phí để nhận 10 ảnh/ngày. Lên Pro: 200 ảnh + 200 video, API key, Quality mode, Webhook.
      </p>
      <div className="mt-3 space-y-1.5">
        <Link to="/register" className="block text-center rounded-md bg-white text-violet-700 px-4 py-2 text-sm font-bold hover:bg-violet-50">
          Đăng ký miễn phí
        </Link>
        <Link to="/pricing" className="block text-center rounded-md bg-white/15 backdrop-blur-sm border border-white/40 text-white px-4 py-2 text-sm font-semibold hover:bg-white/25">
          Xem bảng giá
        </Link>
      </div>
    </div>
  );
}

// ─── Below-fold sections ──────────────────────────────────────────────────

function HowItWorksStrip() {
  const steps = [
    { icon: Sparkles, title: "Gõ prompt", desc: "Mô tả ảnh bằng tiếng Việt hoặc tiếng Anh" },
    { icon: ImageIcon, title: "Chọn khung hình", desc: "Vuông, ngang 16:9, dọc 9:16 hoặc 4:3 / 3:4" },
    { icon: Zap, title: "Bấm tạo", desc: "Render ~15s với chế độ Nhanh, ~45s với Cao" },
    { icon: Download, title: "Tải về", desc: "PNG/JPG full resolution. Dùng commercial OK" },
  ];
  return (
    <section className="mt-16">
      <div className="text-center mb-8">
        <p className="text-xs uppercase tracking-wider text-violet-600 font-bold">Cách dùng · 4 bước</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-bold">Từ prompt đến ảnh trong 1 phút</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <div key={s.title} className="relative rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white font-bold text-sm flex items-center justify-center shadow-md">
              {i + 1}
            </span>
            <s.icon size={22} className="text-violet-600" />
            <h3 className="font-bold mt-3">{s.title}</h3>
            <p className="text-sm text-slate-600 mt-1 leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqStrip() {
  const items = [
    {
      q: "Ảnh tạo ra mình có dùng thương mại được không?",
      a: "Có — bạn giữ bản quyền các ảnh do prompt của bạn tạo ra. Tuy nhiên không nên dùng cho nội dung deceptive, deepfake, hoặc vi phạm bản quyền của người khác.",
    },
    {
      q: "Tại sao bị giới hạn chỉ 2 ảnh?",
      a: "Anonymous được dùng thử để cảm nhận chất lượng. Để dùng nhiều hơn, đăng ký Free (10 ảnh/ngày) hoặc Basic 199k/tháng (50/ngày).",
    },
    {
      q: "Quality mode khác Speed mode thế nào?",
      a: "Speed render trong ~15s, kết quả OK cho social media. Quality render ~45s, chi tiết hơn, phù hợp poster, in ấn. Quality chỉ available trên gói Pro.",
    },
    {
      q: "Có lưu lịch sử ảnh không?",
      a: "Lịch sử 6 ảnh gần nhất được lưu trong trình duyệt (localStorage). Đăng ký tài khoản để lưu vĩnh viễn ở /gallery.",
    },
  ];
  return (
    <section className="mt-16 max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-wider text-violet-600 font-bold">FAQ</p>
        <h2 className="mt-1 text-2xl font-bold">Câu hỏi thường gặp</h2>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => <FaqRow key={i} q={it.q} a={it.a} />)}
      </div>
    </section>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
      >
        <span className="font-semibold text-sm text-slate-800">{q}</span>
        {open ? <X size={14} className="text-violet-600 rotate-45" /> : <ArrowRight size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────

function Footer({ brandName }: { brandName: string }) {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <Link to="/landing" className="font-bold text-lg inline-flex items-center gap-1.5">
              <Wand2 size={18} className="text-violet-400" />
              <span className="text-white">{brandName}</span>
            </Link>
            <p className="text-xs text-slate-400 mt-2">
              AI image/video API + LLM Gateway + Flow tools. Self-hosted ready.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white mb-1.5">Sản phẩm</p>
            <ul className="space-y-1 text-slate-400">
              <li><Link to="/try/image" className="hover:text-violet-400">Thử Grok Image</Link></li>
              <li><Link to="/pricing" className="hover:text-violet-400">Bảng giá</Link></li>
              <li><Link to="/landing#modules" className="hover:text-violet-400">Tính năng</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white mb-1.5">Tài khoản</p>
            <ul className="space-y-1 text-slate-400">
              <li><Link to="/login" className="hover:text-violet-400">Đăng nhập</Link></li>
              <li><Link to="/register" className="hover:text-violet-400">Đăng ký</Link></li>
              <li><Link to="/terms" className="hover:text-violet-400">Điều khoản</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {brandName}.</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─── localStorage helpers ─────────────────────────────────────────────────

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch { /* quota / disabled — silently ignore */ }
}
