import { BookOpen } from "lucide-react";

const SECTIONS = [
  {
    title: "API Docs",
    items: [
      { method: "POST", path: "/api/v1/auth/login", desc: "Admin login → JWT" },
      { method: "POST", path: "/api/v1/gateway/gateway-keys/verify", desc: "Verify Gateway API Key" },
      { method: "POST", path: "/api/v1/gateway/functions/{function_code}/execute", desc: "Sync execute" },
      { method: "POST", path: "/api/v1/gateway/functions/{function_code}/submit", desc: "Async submit (coming soon)" },
      { method: "GET",  path: "/api/v1/gateway/requests/{request_id}/status", desc: "Polling request status" },
    ],
  },
  {
    title: "Business Flow",
    items: [
      { method: "GET", path: "1. Tạo Vendor (Google)", desc: "Khai báo upstream LLM provider" },
      { method: "GET", path: "2. Tạo Pool (gemini-api)", desc: "Group key cho 1 model" },
      { method: "GET", path: "3. Nhập API Keys vào pool", desc: "Add các key Gemini API thật + project_id + priority" },
      { method: "GET", path: "4. Phát hành Gateway API Key prefix gwk_…", desc: "Issue key cho khách" },
      { method: "GET", path: "5. Client gọi function, backend chọn key trong pool", desc: "Smart routing — priority desc, used_count asc" },
    ],
  },
];

const METHOD_CLS: Record<string, string> = {
  GET:    "bg-emerald-500 text-white",
  POST:   "bg-blue-500 text-white",
  PUT:    "bg-amber-500 text-white",
  PATCH:  "bg-amber-500 text-white",
  DELETE: "bg-rose-500 text-white",
};

export function GatewayDocsPage() {
  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-semibold flex items-center gap-2">
        <BookOpen size={22} /> Gateway — API Docs
      </h1>

      <div className="grid lg:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="card">
            <h2 className="font-semibold mb-3">{s.title}</h2>
            <div className="space-y-2">
              {s.items.map((it) => (
                <div key={it.path} className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                  {s.title === "API Docs" ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold flex-shrink-0 ${METHOD_CLS[it.method] ?? "bg-slate-500 text-white"}`}>
                      {it.method}
                    </span>
                  ) : (
                    <span className="w-5 text-right font-semibold text-brand-600 flex-shrink-0">
                      {it.path[0]}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    {s.title === "API Docs" ? (
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
