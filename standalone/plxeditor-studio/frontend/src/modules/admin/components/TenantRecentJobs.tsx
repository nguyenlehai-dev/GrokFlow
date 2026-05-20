import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Video, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatRelative } from "@/core/utils/format";
import type { JobLite } from "../models/dashboard";

export function TenantRecentJobs({ jobs }: { jobs: JobLite[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="font-semibold text-slate-800">{t("admin.tenant_dash_recent_jobs")}</h2>
        <Link to="/jobs" className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1">
          {t("admin.tenant_dash_view_all")} <ArrowRight size={12} />
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{t("admin.tenant_dash_no_jobs")}</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {jobs.map((j) => (
            <li key={j.id} className="px-4 py-3 flex items-center gap-3">
              {j.job_type === "video"
                ? <Video size={16} className="text-violet-500 flex-shrink-0" />
                : <ImageIcon size={16} className="text-violet-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 truncate">{j.prompt || t("admin.tenant_dash_no_prompt")}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{j.id.slice(0, 8)}</span>
                  <span className="mx-1">·</span>
                  <span>{formatRelative(j.created_at)}</span>
                </p>
              </div>
              <StatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
