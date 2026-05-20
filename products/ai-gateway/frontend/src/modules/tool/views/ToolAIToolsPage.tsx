import { Link } from "react-router-dom";
import {
  Scissors, Combine, Volume2, VolumeX, Gauge, Maximize2, Crop, Camera,
} from "lucide-react";

import { ToolShell } from "../components/ToolShell";

const TOOLS = [
  { to: "/flow/cut",            icon: Scissors,   title: "Cắt video",       desc: "Trim đoạn video theo timestamp" },
  { to: "/flow/merge",          icon: Combine,    title: "Ghép video",      desc: "Nối nhiều clip thành 1" },
  { to: "/flow/extract-audio",  icon: VolumeX,    title: "Tách audio",      desc: "Xuất audio từ video → MP3/WAV" },
  { to: "/flow/add-audio",      icon: Volume2,    title: "Thêm nhạc",       desc: "Ghép audio vào video" },
  { to: "/flow/speed",          icon: Gauge,      title: "Đổi tốc độ",      desc: "Speedup / slowmo + atempo audio" },
  { to: "/flow/resize",         icon: Maximize2,  title: "Resize",          desc: "Đổi kích thước canvas + padding" },
  { to: "/flow/crop",           icon: Crop,       title: "Crop",            desc: "Cắt khung theo tỉ lệ" },
  { to: "/flow/extract-frames", icon: Camera,     title: "Trích frame",     desc: "Export frame thành PNG zip" },
];

export function ToolAIToolsPage() {
  return (
    <ToolShell
      title="Công cụ AI"
      subtitle="Bộ công cụ xử lý video (Flow module)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="tool-card tool-card-hover tool-tile p-4 group"
            >
              <div className="tool-tile-icon w-12 h-12 rounded-xl mb-3 grid place-items-center">
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="font-semibold text-white">{t.title}</h3>
              <p className="text-xs text-violet-200/60 mt-1">{t.desc}</p>
            </Link>
          );
        })}
      </div>
    </ToolShell>
  );
}

export default ToolAIToolsPage;
