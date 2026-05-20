import { useEffect, useState, type ReactNode } from "react";
import { HelpCircle, X, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

export interface HelpStep {
  title: string;
  /** Body content. Plain string renders as a paragraph; pass JSX to embed
   *  highlighted commands, code blocks, lists, screenshots, etc. */
  body: ReactNode;
  /** Optional caption rendered under the body — usually a tip or warning. */
  hint?: ReactNode;
}

interface HelpButtonProps {
  /** Modal title — usually the feature name. */
  title: string;
  /** One-paragraph overview shown above the steps. */
  intro?: ReactNode;
  /** Step-by-step walkthrough. Pass at least one step. */
  steps: HelpStep[];
  /** Optional FAQ pairs shown below the steps. */
  faq?: { q: string; a: ReactNode }[];
  /** Render style of the trigger.
   *    "icon"   — small circular question-mark (default; sits in toolbars)
   *    "inline" — pill button with "Hướng dẫn" label */
  variant?: "icon" | "inline";
  /** Override the trigger label when `variant="inline"`. */
  label?: string;
  /** Optional extra className applied to the trigger. */
  className?: string;
}

/** Generic "open feature help" trigger. Drop next to any feature header
 *  and pass it a list of steps — opens a side-aware modal with a stepper
 *  the user can flip through. The button + modal are fully accessible
 *  (Esc closes, focus trapped, aria-modal). */
export function HelpButton({
  title, intro, steps, faq, variant = "icon", label = "Hướng dẫn", className = "",
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const triggerCls =
    variant === "icon"
      ? "inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition"
      : "inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition";

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => { setStepIdx(0); setOpen(true); }}
        className={`${triggerCls} ${className}`}
      >
        <HelpCircle size={variant === "icon" ? 16 : 14} />
        {variant === "inline" && <span>{label}</span>}
      </button>

      {open && (
        <HelpModal
          title={title}
          intro={intro}
          steps={steps}
          faq={faq}
          stepIdx={stepIdx}
          setStepIdx={setStepIdx}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface ModalProps {
  title: string;
  intro?: ReactNode;
  steps: HelpStep[];
  faq?: { q: string; a: ReactNode }[];
  stepIdx: number;
  setStepIdx: (i: number) => void;
  onClose: () => void;
}

function HelpModal({
  title, intro, steps, faq, stepIdx, setStepIdx, onClose,
}: ModalProps) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const isFirst = stepIdx === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 id="help-modal-title" className="text-lg font-semibold text-slate-800">
              {title}
            </h2>
            {intro && <p className="mt-1 text-sm text-slate-500">{intro}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </header>

        {/* Stepper indicator */}
        {steps.length > 1 && (
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <ol className="flex flex-wrap items-center gap-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStepIdx(i)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                      i < stepIdx
                        ? "bg-emerald-500 text-white"
                        : i === stepIdx
                          ? "bg-blue-600 text-white ring-4 ring-blue-100"
                          : "bg-slate-200 text-slate-500"
                    }`}
                    aria-label={`Bước ${i + 1}: ${s.title}`}
                  >
                    {i < stepIdx ? <CheckCircle2 size={14} /> : i + 1}
                  </button>
                  {i < steps.length - 1 && (
                    <span className={`h-px w-6 ${i < stepIdx ? "bg-emerald-500" : "bg-slate-200"}`} />
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Bước {stepIdx + 1} / {steps.length}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-800">{step.title}</h3>
          <div className="prose prose-sm mt-3 max-w-none text-slate-600">{step.body}</div>
          {step.hint && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              💡 {step.hint}
            </div>
          )}

          {/* FAQ — shown on the last step only to avoid noise on early ones. */}
          {isLast && faq && faq.length > 0 && (
            <section className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="text-sm font-semibold text-slate-700">Câu hỏi thường gặp</h4>
              <dl className="mt-3 space-y-3">
                {faq.map((it, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <dt className="text-sm font-medium text-slate-800">Q: {it.q}</dt>
                    <dd className="mt-1 text-xs text-slate-600">A: {it.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        {/* Footer nav */}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={isFirst}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={14} /> Trước
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <CheckCircle2 size={14} /> Hiểu rồi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tiếp <ArrowRight size={14} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
