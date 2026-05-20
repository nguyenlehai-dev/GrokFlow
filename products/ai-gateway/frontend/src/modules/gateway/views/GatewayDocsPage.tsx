import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const METHOD_CLS: Record<string, string> = {
  GET:    "bg-emerald-500 text-white",
  POST:   "bg-blue-500 text-white",
  PUT:    "bg-amber-500 text-white",
  PATCH:  "bg-amber-500 text-white",
  DELETE: "bg-rose-500 text-white",
};

export function GatewayDocsPage() {
  const { t } = useTranslation();

  const SECTIONS = [
    {
      title: t("gateway.gw_docs_section_api"),
      items: [
        { method: "POST", path: "/api/v1/auth/login", desc: t("gateway.gw_docs_api_login") },
        { method: "POST", path: "/api/v1/gateway/gateway-keys/verify", desc: t("gateway.gw_docs_api_verify") },
        { method: "POST", path: "/api/v1/gateway/functions/{function_code}/execute", desc: t("gateway.gw_docs_api_execute") },
        { method: "POST", path: "/api/v1/gateway/functions/{function_code}/submit", desc: t("gateway.gw_docs_api_submit") },
        { method: "GET",  path: "/api/v1/gateway/requests/{request_id}/status", desc: t("gateway.gw_docs_api_status") },
      ],
    },
    {
      title: t("gateway.gw_docs_section_flow"),
      items: [
        { method: "GET", path: t("gateway.gw_docs_flow_1_path"), desc: t("gateway.gw_docs_flow_1_desc") },
        { method: "GET", path: t("gateway.gw_docs_flow_2_path"), desc: t("gateway.gw_docs_flow_2_desc") },
        { method: "GET", path: t("gateway.gw_docs_flow_3_path"), desc: t("gateway.gw_docs_flow_3_desc") },
        { method: "GET", path: t("gateway.gw_docs_flow_4_path"), desc: t("gateway.gw_docs_flow_4_desc") },
        { method: "GET", path: t("gateway.gw_docs_flow_5_path"), desc: t("gateway.gw_docs_flow_5_desc") },
      ],
    },
  ];

  const apiTitle = t("gateway.gw_docs_section_api");

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="page-title flex items-center gap-2">
        <BookOpen size={22} /> {t("gateway.gw_docs_title")}
      </h1>

      <div className="grid lg:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="card">
            <h2 className="font-semibold mb-3">{s.title}</h2>
            <div className="space-y-2">
              {s.items.map((it) => (
                <div key={it.path} className="flex items-start gap-2 py-1.5 border-b border-slate-200 last:border-0">
                  {s.title === apiTitle ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold flex-shrink-0 ${METHOD_CLS[it.method] ?? "bg-slate-400 text-slate-800"}`}>
                      {it.method}
                    </span>
                  ) : (
                    <span className="w-5 text-right font-semibold text-brand-600 flex-shrink-0">
                      {it.path[0]}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    {s.title === apiTitle ? (
                      <code className="text-sm font-mono break-all">{it.path}</code>
                    ) : (
                      <strong className="text-sm">{it.path.slice(2)}</strong>
                    )}
                    {it.desc && (
                      <p className="text-xs text-slate-500 mt-0.5">{it.desc}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
