import { Link } from "react-router-dom";
import { Settings as SettingsIcon, ArrowRight } from "lucide-react";

import { ToolShell } from "../components/ToolShell";

export function ToolSettingsPage() {
  return (
    <ToolShell title="Cài Đặt" subtitle="Tùy chỉnh tài khoản + tham chiếu nhanh">
      <div className="tool-card p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="tool-tile-icon w-16 h-16 rounded-2xl mx-auto grid place-items-center">
          <SettingsIcon size={28} className="text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">Cài đặt user</h3>
        <p className="text-sm text-violet-200/70">
          Đổi profile, ngôn ngữ, webhook... dùng trang Settings chính.
        </p>
        <Link
          to="/settings"
          className="tool-btn-primary inline-flex items-center gap-1.5"
        >
          Đi tới Cài Đặt <ArrowRight size={14} />
        </Link>
      </div>
    </ToolShell>
  );
}

export default ToolSettingsPage;
