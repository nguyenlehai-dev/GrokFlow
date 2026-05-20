import type { ReactNode } from "react";
import { X } from "lucide-react";

export function ApiKeyModalShell({
  title, children, onClose, maxWidth = "max-w-lg",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className={`w-full ${maxWidth} max-h-[92vh] rounded-lg bg-white shadow-xl flex flex-col`}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-9000 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
