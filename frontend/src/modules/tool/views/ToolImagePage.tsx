import { Link } from "react-router-dom";
import { Image as ImageIcon, ArrowRight } from "lucide-react";

import { ToolShell } from "../components/ToolShell";

export function ToolImagePage() {
  return (
    <ToolShell title="Tạo Hình Ảnh" subtitle="Tạo ảnh AI nghệ thuật">
      <div className="tool-card p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="tool-tile-icon w-16 h-16 rounded-2xl mx-auto grid place-items-center">
          <ImageIcon size={28} className="text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">Mở Grok Playground</h3>
        <p className="text-sm text-violet-200/70">
          Image creator hiện share với Grok Playground. Chọn mode <b>Text → Image</b> hoặc <b>Image → Image</b>.
        </p>
        <Link
          to="/playground?mode=t2i"
          className="tool-btn-primary inline-flex items-center gap-1.5"
        >
          Đi tới Playground <ArrowRight size={14} />
        </Link>
      </div>
    </ToolShell>
  );
}

export default ToolImagePage;
