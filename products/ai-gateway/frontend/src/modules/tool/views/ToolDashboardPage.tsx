import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Video, MessageCircle, Image as ImageIcon, FileText,
  ArrowUpRight, Sparkles,
} from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { api } from "@/core/api/axios";
import { ToolShell } from "../components/ToolShell";
import { TileCard } from "../components/TileCard";

interface DashboardJob {
  id: string;
  prompt: string | null;
  result_url: string | null;
}

/** GROK VIP TOOL — dashboard. The four big tiles are the user's entry
 *  points into the most-used features; the "Recent projects" row is a
 *  thumbnail strip of their latest completed Grok jobs. */
export function ToolDashboardPage() {
  const me = useAuthStore((s) => s.user);
  const greeting = me?.full_name || me?.email?.split("@")[0] || "Creator";

  // Pull the latest few successful Grok jobs (image + video) — those
  // give us thumbnails. Backend already sorts by created_at desc.
  const { data: recent } = useQuery({
    queryKey: ["tool-dashboard-recent"],
    queryFn: () =>
      api
        .get<DashboardJob[]>("/api/jobs", { params: { status: "success", limit: 6 } })
        .then((r) => r.data),
    staleTime: 30_000,
  });

  return (
    <ToolShell
      title={`Xin chào, ${greeting}!`}
      subtitle="Tạo nội dung AI chuyên nghiệp chỉ với vài thao tác"
    >
      {/* 4 quick-action tiles in a 2x2 grid (1 col on mobile). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <TileCard
          to="/tool/video"
          icon={Video}
          title="Tạo Video AI"
          subtitle="Tạo video từ prompt"
        />
        <TileCard
          to="/tool/chat"
          icon={MessageCircle}
          title="AI Chat"
          subtitle="Chat với AI thông minh"
        />
        <TileCard
          to="/tool/image"
          icon={ImageIcon}
          title="Tạo Hình Ảnh"
          subtitle="Tạo ảnh AI nghệ thuật"
        />
        <TileCard
          to="/tool/prompts"
          icon={FileText}
          title="Mẫu Prompt"
          subtitle="Kho prompt chất lượng"
        />
      </div>

      {/* Recent projects strip — thumbnails of last 6 successful jobs. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white text-lg flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            Dự án gần đây
          </h2>
          <Link
            to="/tool/history"
            className="text-xs text-violet-300 hover:text-violet-100 inline-flex items-center gap-1"
          >
            Xem tất cả <ArrowUpRight size={12} />
          </Link>
        </div>

        {recent && recent.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {recent.map((j) => (
              <Link
                key={j.id}
                to={`/jobs/${j.id}`}
                className="tool-card tool-card-hover overflow-hidden aspect-square group"
              >
                {j.result_url ? (
                  <img
                    src={j.result_url}
                    alt={j.prompt?.slice(0, 50)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={28} className="text-violet-300/50" />
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="tool-card p-8 text-center text-violet-200/60 text-sm">
            Chưa có dự án nào. Bắt đầu bằng cách click 1 trong 4 tile phía trên.
          </div>
        )}
      </section>
    </ToolShell>
  );
}
