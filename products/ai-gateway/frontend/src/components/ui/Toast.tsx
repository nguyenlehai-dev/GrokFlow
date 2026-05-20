import { create } from "zustand";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  push: (msg: string, type?: Toast["type"]) => void;
  remove: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = "info") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, type: Toast["type"] = "info") {
  useToastStore.getState().push(message, type);
}

// Per-type styling. Each variant pairs an icon with a glass-tinted surface so
// the toast stays legible over any page background but still feels lifted.
const TOAST_VARIANTS = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    surface: "bg-white border-emerald-200 text-emerald-900",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-rose-500",
    surface: "bg-white border-rose-200 text-rose-900",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-600",
    surface: "bg-white border-brand-200 text-slate-900",
  },
} as const;

export function ToastContainer() {
  const { toasts, remove } = useToastStore();
  return (
    <div className="fixed top-5 right-5 z-[100] space-y-2.5 max-w-sm">
      {toasts.map((t) => {
        const v = TOAST_VARIANTS[t.type];
        const Icon = v.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={`group animate-slide-up flex items-start gap-3 rounded-xl border ${v.surface} px-4 py-3 shadow-card-hover backdrop-blur`}
          >
            <Icon size={18} className={`shrink-0 mt-0.5 ${v.iconClass}`} />
            <p className="text-sm flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-slate-500 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
