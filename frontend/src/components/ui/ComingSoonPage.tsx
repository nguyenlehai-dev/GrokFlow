import { Construction } from "lucide-react";

export function ComingSoonPage({
  title, description,
}: { title: string; description?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="card flex items-center gap-4 max-w-2xl">
        <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Construction size={24} className="text-amber-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Sắp ra mắt</h2>
          <p className="text-sm text-slate-600 mt-1">
            {description ?? `Tính năng "${title}" đang được phát triển. Quay lại sau nhé!`}
          </p>
        </div>
      </div>
    </div>
  );
}
