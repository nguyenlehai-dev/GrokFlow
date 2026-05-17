import { Link } from "react-router-dom";
import { Video, ArrowRight } from "lucide-react";

import { ToolShell } from "../components/ToolShell";

/** Quick redirect to the existing Grok job-create flow with t2v preset.
 *  Until we build a dedicated VIP-themed creator, route the user to
 *  /playground (which has the full t2i/i2i/t2v/i2v mode picker). */
export function ToolVideoPage() {
  return (
    <ToolShell title="Tạo Video AI" subtitle="Tạo video từ prompt">
      <div className="tool-card p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="tool-tile-icon w-16 h-16 rounded-2xl mx-auto grid place-items-center">
          <Video size={28} className="text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">Mở Grok Playground</h3>
        <p className="text-sm text-violet-200/70">
          Hiện tại video creator dùng chung với Grok Playground. Chọn mode <b>Text → Video</b> hoặc <b>Image → Video</b>.
        </p>
        <Link
          to="/playground?mode=t2v"
          className="tool-btn-primary inline-flex items-center gap-1.5"
        >
          Đi tới Playground <ArrowRight size={14} />
        </Link>
      </div>
    </ToolShell>
  );
}

export default ToolVideoPage;
