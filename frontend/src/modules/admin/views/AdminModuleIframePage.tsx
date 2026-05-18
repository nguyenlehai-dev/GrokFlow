import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { AdminGuard } from "../components/AdminGuard";
import { adminModulesService } from "../services/modules.service";

/** Renders an installed module inside an iframe.
 *
 *  Route: /admin/modules/:slug
 *  Source: /m/:slug/?token=<user-jwt>  — proxied by nginx (prod) or vite (dev)
 *
 *  The user's JWT is passed through the URL so the module's FE can hand
 *  it to its BE which forwards to /api/sdk/auth/verify. Theme variables
 *  are also passed so the module's `@grokflow/ui` picks up the right
 *  colours.
 */
export function AdminModuleIframePage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}


function Inner() {
  const { slug = "" } = useParams();
  const token = useAuthStore((s) => s.token);

  const { data: modules, isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: () => adminModulesService.list(),
  });
  const module = modules?.find((m) => m.slug === slug);

  const iframeSrc = useMemo(() => {
    if (!module || !token) return "";
    const theme = btoa(JSON.stringify({
      primary: "#7c3aed",
      bg: "#ffffff",
      fg: "#0f172a",
      border: "#e2e8f0",
      radius: "0.5rem",
    }));
    return `/m/${slug}/?token=${encodeURIComponent(token)}&theme=${theme}`;
  }, [module, token, slug]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500 inline-flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Đang tải module…
      </div>
    );
  }

  if (!module) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 inline-flex gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <div className="font-semibold">Module <code>{slug}</code> not found</div>
            <Link to="/admin/modules" className="text-rose-700 underline text-xs">
              Quay lại /admin/modules
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (module.status !== "running") {
    return (
      <div className="p-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold mb-1 inline-flex items-center gap-2">
            <AlertCircle size={16} /> Module chưa sẵn sàng — status: {module.status}
          </div>
          {module.last_error && (
            <pre className="mt-2 text-xs text-rose-700 bg-white border border-rose-200 rounded p-2 overflow-x-auto">
              {module.last_error}
            </pre>
          )}
          <Link to="/admin/modules" className="text-xs underline mt-2 inline-block">
            Quản lý modules
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
        <div className="inline-flex items-center gap-2">
          <span className="font-semibold text-slate-800">{module.manifest?.menu?.label ?? slug}</span>
          <span className="font-mono text-slate-500">v{module.version}</span>
        </div>
        <a
          href={`/m/${slug}/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-violet-600"
        >
          Mở tab mới <ExternalLink size={12} />
        </a>
      </div>
      <iframe
        title={module.slug}
        src={iframeSrc}
        // sandbox: allow scripts + same-origin so module can use cookies
        // + storage. NOT allowing top-navigation so module can't redirect
        // the parent shell to a phishing URL.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
