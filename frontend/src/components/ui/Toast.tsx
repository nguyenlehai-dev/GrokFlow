import { create } from "zustand";

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

export function ToastContainer() {
  const { toasts, remove } = useToastStore();
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`max-w-sm cursor-pointer rounded-md px-4 py-2 text-sm shadow-md ${
            t.type === "success"
              ? "bg-emerald-500 text-white"
              : t.type === "error"
              ? "bg-rose-500 text-white"
              : "bg-slate-800 text-white"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
