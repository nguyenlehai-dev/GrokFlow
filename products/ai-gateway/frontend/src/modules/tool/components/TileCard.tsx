import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export function TileCard({
  to, icon: Icon, title, subtitle,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="tool-card tool-card-hover tool-tile flex items-center gap-4 p-5 group"
    >
      <span className="tool-tile-icon w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={26} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-white text-base group-hover:text-violet-200 transition-colors">
          {title}
        </div>
        <div className="text-xs text-violet-200/60 mt-0.5">{subtitle}</div>
      </div>
    </Link>
  );
}
