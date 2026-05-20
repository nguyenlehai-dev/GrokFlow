/**
 * App-wide confirm modal — replaces `window.confirm()`.
 *
 *   const ok = await confirm({ message: "Xoá?", title: "Bạn chắc chứ?" });
 *   if (ok) doIt();
 *
 * Drop `<ConfirmDialogHost />` once near the root (already done in main.tsx
 * next to ToastContainer) and any component anywhere can call `confirm()`.
 *
 * Why a custom modal instead of the browser's: the native confirm() is
 * unstyled, looks like a Chrome warning popup, and breaks the design
 * system. This one matches our card/button styling and accepts richer
 * options (variant=danger, custom labels, optional title/description).
 */
import { create } from "zustand";
import { AlertTriangle, Trash2, Info, HelpCircle } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info" | "neutral";

export interface ConfirmOptions {
  /** Main question shown in the dialog body. */
  message: string;
  /** Optional short heading above the message. */
  title?: string;
  /** Confirm button label (default: "OK"). */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel"). */
  cancelLabel?: string;
  /** Color scheme — danger=red, warning=amber, info=blue, neutral=slate. */
  variant?: ConfirmVariant;
}

interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  open: (opts: ConfirmOptions, resolve: (ok: boolean) => void) => void;
  close: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  open: (opts, resolve) => {
    // Multiple concurrent confirms aren't useful — the user can't focus
    // two dialogs at once. Auto-resolve the previous one as cancel.
    const prev = get().pending;
    if (prev) prev.resolve(false);
    set({ pending: { ...opts, id: Date.now() + Math.random(), resolve } });
  },
  close: (ok) => {
    const p = get().pending;
    if (p) {
      p.resolve(ok);
      set({ pending: null });
    }
  },
}));

/** Promise-returning confirm — drop-in replacement for `window.confirm()`. */
export function confirm(opts: ConfirmOptions | string): Promise<boolean> {
  const normalized: ConfirmOptions =
    typeof opts === "string" ? { message: opts } : opts;
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().open(normalized, resolve);
  });
}


const VARIANTS = {
  danger: {
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    icon: Trash2,
    btnClass: "bg-rose-600 hover:bg-rose-700 text-white",
  },
  warning: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    icon: AlertTriangle,
    btnClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  info: {
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    icon: Info,
    btnClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  neutral: {
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    icon: HelpCircle,
    btnClass: "bg-slate-700 hover:bg-slate-800 text-white",
  },
} as const;


export function ConfirmDialogHost() {
  const pending = useConfirmStore((s) => s.pending);
  const close = useConfirmStore((s) => s.close);
  if (!pending) return null;
  const v = VARIANTS[pending.variant ?? "neutral"];
  const Icon = v.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => close(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      }}
      tabIndex={-1}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 flex gap-4">
          <div className={`w-12 h-12 rounded-full grid place-items-center shrink-0 ${v.iconBg}`}>
            <Icon size={22} className={v.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            {pending.title && (
              <h3 className="font-semibold text-slate-900 text-base">{pending.title}</h3>
            )}
            <p className={`text-sm text-slate-600 ${pending.title ? "mt-1" : ""}`}>
              {pending.message}
            </p>
          </div>
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100"
            autoFocus
          >
            {pending.cancelLabel ?? "Huỷ"}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${v.btnClass}`}
          >
            {pending.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
