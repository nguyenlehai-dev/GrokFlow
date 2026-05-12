import { BookOpen, ExternalLink } from "lucide-react";

const SECTIONS = [
  {
    title: "Authentication",
    items: [
      { method: "POST", path: "/api/auth/login", desc: "Admin login → access_token Bearer." },
      { method: "GET",  path: "/api/auth/bootstrap", desc: "Get configured admin username." },
    ],
  },
  {
    title: "Profiles",
    items: [
      { method: "GET",    path: "/api/profiles", desc: "List all profiles." },
      { method: "POST",   path: "/api/profiles", desc: "Create a profile (name, category, concurrency_limit)." },
      { method: "GET",    path: "/api/profiles/{id}", desc: "Get profile details." },
      { method: "PUT",    path: "/api/profiles/{id}", desc: "Update profile fields." },
      { method: "DELETE", path: "/api/profiles/{id}", desc: "Delete profile + storage." },
    ],
  },
  {
    title: "Proxies",
    items: [
      { method: "GET",    path: "/api/proxies", desc: "List proxies." },
      { method: "POST",   path: "/api/proxies", desc: "Create proxy (server, port, kind, country)." },
      { method: "PUT",    path: "/api/proxies/{id}", desc: "Update proxy." },
      { method: "DELETE", path: "/api/proxies/{id}", desc: "Delete proxy." },
    ],
  },
  {
    title: "API Keys",
    items: [
      { method: "GET",    path: "/api/api-keys", desc: "List API keys (prefix only)." },
      { method: "POST",   path: "/api/api-keys", desc: "Create new key — plain_key trả về 1 lần duy nhất." },
      { method: "DELETE", path: "/api/api-keys/{id}", desc: "Revoke key." },
    ],
  },
  {
    title: "Jobs",
    items: [
      { method: "GET",  path: "/api/jobs", desc: "List jobs (queued + history)." },
      { method: "POST", path: "/api/jobs", desc: "Create a job (profile_id + target + prompt)." },
      { method: "GET",  path: "/api/jobs/{id}", desc: "Job status + result." },
    ],
  },
  {
    title: "Settings",
    items: [
      { method: "GET", path: "/api/settings", desc: "Get automation settings." },
      { method: "PUT", path: "/api/settings", desc: "Update headless/concurrency/timeout." },
    ],
  },
  {
    title: "Meta",
    items: [
      { method: "GET", path: "/api/meta", desc: "Available categories / targets / providers." },
    ],
  },
  {
    title: "Client (API key auth)",
    items: [
      { method: "POST", path: "/api/client/jobs", desc: "Public job creation — header x-api-key required." },
      { method: "GET",  path: "/api/client/jobs/{id}", desc: "Polling status." },
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
  const apiBase = typeof window !== "undefined"
    ? `${window.location.origin}/gateway-api`
    : "http://localhost:8001";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen size={22} /> Gateway — API Docs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Endpoint cho <code>gatewaygrok-backend</code>. Admin endpoints cần
          <code className="ml-1">Authorization: Bearer &lt;admin-token&gt;</code> (login qua
          {" "}<a href="/gateway/profiles" className="text-brand-600 underline">/gateway/profiles</a>).
          Client endpoints (<code>/api/client/*</code>) dùng <code>x-api-key</code> header.
        </p>
        <p className="text-xs text-slate-500 mt-1 font-mono">
          Base URL: {apiBase}
        </p>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.title} className="card">
          <h2 className="font-semibold mb-3">{s.title}</h2>
          <div className="space-y-1.5">
            {s.items.map((it) => (
              <div
                key={`${it.method}-${it.path}`}
                className="flex items-start gap-3 py-1.5 border-b border-slate-100 last:border-0"
              >
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${METHOD_CLS[it.method]} flex-shrink-0 mt-0.5`}>
                  {it.method}
                </span>
                <code className="text-sm font-mono text-slate-800 flex-shrink-0">
                  {it.path}
                </code>
                <span className="text-sm text-slate-600 ml-auto text-right">
                  {it.desc}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2 className="font-semibold mb-2">OpenAPI live spec</h2>
        <p className="text-sm text-slate-600">
          Backend FastAPI tự sinh OpenAPI tại:
        </p>
        <div className="mt-2 space-y-1 text-sm">
          <a href={`${apiBase}/openapi.json`} target="_blank" rel="noreferrer"
            className="text-brand-600 hover:underline inline-flex items-center gap-1">
            {apiBase}/openapi.json <ExternalLink size={12} />
          </a>
          <br />
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer"
            className="text-brand-600 hover:underline inline-flex items-center gap-1">
            {apiBase}/docs (Swagger UI) <ExternalLink size={12} />
          </a>
        </div>
      </section>
    </div>
  );
}
