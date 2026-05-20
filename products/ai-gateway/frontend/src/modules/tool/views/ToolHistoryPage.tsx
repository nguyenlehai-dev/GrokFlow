import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Video, FileText, Loader2 } from "lucide-react";

import { api } from "@/core/api/axios";
import { ToolShell } from "../components/ToolShell";

interface HistoryJob {
  id: string;
  job_type: string;
  status: string;
  prompt: string | null;
  result_url: string | null;
  created_at: string;
}

export function ToolHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["tool-history"],
    queryFn: () =>
      api.get<HistoryJob[]>("/api/jobs", { params: { limit: 50 } }).then((r) => r.data),
  });

  return (
    <ToolShell
      title="Lịch Sử"
      subtitle="50 dự án gần nhất của bạn"
    >
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 size={20} className="animate-spin text-violet-300 mx-auto" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="tool-card p-8 text-center text-violet-200/60 text-sm">
          Chưa có dự án nào.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {data!.map((j) => {
            const Icon = j.job_type === "video" ? Video : j.job_type === "image" ? ImageIcon : FileText;
            return (
              <div key={j.id} className="tool-card tool-card-hover overflow-hidden">
                <div className="aspect-square bg-slate-900/50 flex items-center justify-center">
                  {j.result_url ? (
                    j.job_type === "video" ? (
                      <video src={j.result_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={j.result_url} alt={j.prompt?.slice(0, 30)} className="w-full h-full object-cover" loading="lazy" />
                    )
                  ) : (
                    <Icon size={28} className="text-violet-300/40" />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={11} className="text-violet-300" />
                    <span className="text-[10px] uppercase tracking-wider text-violet-300/70">
                      {j.job_type} · {j.status}
                    </span>
                  </div>
                  <p className="text-xs text-violet-100 line-clamp-2" title={j.prompt ?? ""}>
                    {j.prompt || "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ToolShell>
  );
}

export default ToolHistoryPage;
