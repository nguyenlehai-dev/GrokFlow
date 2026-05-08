import { useState } from "react";

type EndpointGroup = {
  title: string;
  endpoints: Endpoint[];
};

type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: "jwt" | "apikey" | "any" | "admin";
  summary: string;
  request?: string;          // request body example (JSON)
  query?: string;            // query string example
  response: string;          // response body example
  notes?: string;
};

const GROUPS: EndpointGroup[] = [
  {
    title: "Authentication",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/login",
        auth: "any",
        summary: "Login bằng email + password, trả về JWT (24h).",
        request: `{
  "email": "admin@example.com",
  "password": "your-password"
}`,
        response: `{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "user": {
    "id": "5941b0d7-56c9-4345-9dd0-23070eaded5b",
    "email": "admin@example.com",
    "role": "admin"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/auth/me",
        auth: "jwt",
        summary: "Profile của user hiện tại.",
        response: `{
  "id": "5941b0d7-...",
  "email": "admin@example.com",
  "role": "admin",
  "status": "active"
}`,
      },
    ],
  },
  {
    title: "Jobs (chính)",
    endpoints: [
      {
        method: "POST",
        path: "/api/jobs",
        auth: "jwt",
        summary: "Tạo job mới (image / video / image-to-image / image-to-video).",
        request: `{
  "provider": "grok",            // "grok" | "flow"
  "job_type": "image",           // "image" | "video"
  "prompt": "A cyberpunk Tokyo street at night",
  "profile_id": null,            // null = auto-pick least-loaded
  "size": "1024x1024",           // legacy; sẽ auto-derive từ aspect
  "model": "aurora",             // grok: aurora|grok-2-image|grok-3-image
  "style": "natural",            // natural | vivid | anime | photographic
  "n": 1,                        // 1-4 variants
  "seed": null,                  // optional integer
  "input_image_file_id": null,   // upload trước qua /api/jobs/upload-input
  "options": {
    "aspect": "16:9",            // 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3
    "quality": "speed",          // "speed" | "quality"
    "duration": 6                // chỉ cho video: 3 / 6 / 9 / 15 giây
  }
}`,
        response: `{
  "id": "412119c5-57cb-44e1-8f1d-0b13e82ef250",
  "provider": "grok",
  "job_type": "image",
  "prompt": "A cyberpunk Tokyo street at night",
  "status": "queued",
  "profile_id": "db423861-...",
  "result_url": null,
  "error_message": null,
  "retry_count": 0,
  "max_retry": 3,
  "next_attempt_at": null,
  "created_at": "2026-05-09T03:14:22Z",
  "completed_at": null
}`,
        notes: "Status flow: queued → running → processing_provider → uploading_result → success / failed.",
      },
      {
        method: "POST",
        path: "/api/jobs/upload-input",
        auth: "jwt",
        summary: "Upload ảnh tham chiếu (image-to-image / image-to-video).",
        request: `multipart/form-data
  file: <binary image, ≤20MB, image/* MIME>`,
        response: `{
  "file_id": "0ca03f25-5ded-4ac0-9198-c8beaa0642e0",
  "file_name": "ref.png",
  "mime_type": "image/png",
  "file_size": 213984
}`,
        notes: "Lấy file_id rồi pass vào input_image_file_id khi POST /api/jobs.",
      },
      {
        method: "GET",
        path: "/api/jobs",
        auth: "jwt",
        summary: "Liệt kê jobs của user.",
        query: "?status=success&limit=50",
        response: `[
  { "id": "...", "status": "success", "result_url": "/api/files/.../download", ... },
  ...
]`,
      },
      {
        method: "GET",
        path: "/api/jobs/{job_id}",
        auth: "jwt",
        summary: "Trạng thái + metadata 1 job.",
        response: `{
  "id": "...", "status": "success",
  "result_url": "/api/files/a902.../download",
  "retry_count": 0, "max_retry": 3,
  "next_attempt_at": null,
  "started_at": "...", "completed_at": "..."
}`,
      },
      {
        method: "GET",
        path: "/api/jobs/{job_id}/files",
        auth: "jwt",
        summary: "Tất cả file output (gallery) — job có thể trả nhiều ảnh.",
        response: `[
  { "id": "...", "file_name": "grok_image_1778257238_1.jpg",
    "file_type": "image", "mime_type": "image/jpeg",
    "file_size": 271313,
    "download_url": "/api/files/.../download" }
]`,
      },
      {
        method: "GET",
        path: "/api/jobs/{job_id}/logs",
        auth: "jwt",
        summary: "Log chi tiết của job (worker, provider, webhook).",
        response: `[
  { "level": "info", "message": "Job queued (profile=menu-types)", "created_at": "..." },
  { "level": "info", "message": "Submit clicked", "created_at": "..." },
  { "level": "error", "message": "[timeout] No new media within timeout", "created_at": "..." }
]`,
      },
      {
        method: "POST",
        path: "/api/jobs/{job_id}/retry",
        auth: "jwt",
        summary: "Retry thủ công job đã failed/cancelled. Tự bump max_retry.",
        response: "<JobOut> với status=queued",
      },
      {
        method: "POST",
        path: "/api/jobs/{job_id}/cancel",
        auth: "jwt",
        summary: "Hủy job đang queued/running.",
        response: "<JobOut> với status=cancelled",
      },
    ],
  },
  {
    title: "Profiles (admin)",
    endpoints: [
      {
        method: "GET",
        path: "/api/profiles",
        auth: "jwt",
        summary: "User: list profile pool admin đã setup. Admin: full list.",
        response: `[
  { "id": "db4238...", "name": "menu-types", "provider": "grok",
    "status": "logged_in", "active_jobs": 0, "max_concurrent_jobs": 3,
    "last_used_at": "...", "created_at": "..." }
]`,
      },
      {
        method: "POST",
        path: "/api/profiles",
        auth: "admin",
        summary: "Tạo profile mới (Chrome user-data-dir trống).",
        request: `{
  "name": "menu-types",
  "provider": "grok",            // "grok" | "flow" | "other"
  "max_concurrent_jobs": 3       // 1-16, mỗi tab ~150MB RAM
}`,
        response: "<ProfileOut>",
      },
      {
        method: "PATCH",
        path: "/api/profiles/{id}",
        auth: "admin",
        summary: "Đổi name / status / max_concurrent_jobs.",
        request: `{ "max_concurrent_jobs": 5 }`,
        response: "<ProfileOut>",
      },
      {
        method: "POST",
        path: "/api/profiles/{id}/upload-cookies",
        auth: "admin",
        summary: "Upload cookies.txt (Netscape format) — workaround khi VPS bị Cloudflare chặn.",
        request: `multipart/form-data
  file: <cookies.txt>`,
        response: "<ProfileOut> với status=logged_in",
      },
      {
        method: "POST",
        path: "/api/profiles/{id}/start-vnc-session",
        auth: "admin",
        summary: "Spawn VNC+Chromium container, trả URL iframe để admin login Grok.",
        response: `{
  "profile_id": "...",
  "iframe_url": "http://host:5173/vnc/<short>/vnc.html?...",
  "expires_in": 86400
}`,
      },
      {
        method: "POST",
        path: "/api/profiles/{id}/finish-vnc-session",
        auth: "admin",
        summary: "Đóng modal Auto-login, container vẫn chạy nền cho worker dùng.",
        response: "<ProfileOut> với status=logged_in",
      },
      {
        method: "POST",
        path: "/api/profiles/{id}/stop-vnc",
        auth: "admin",
        summary: "Dừng VNC container (giải phóng ~1.5GB RAM). Cookies giữ trong volume.",
        response: "<ProfileOut> với status=need_login",
      },
    ],
  },
  {
    title: "Files",
    endpoints: [
      {
        method: "GET",
        path: "/api/files/{file_id}/download",
        auth: "jwt",
        summary: "Tải file kết quả (ảnh/video). Trả binary với Content-Type đúng.",
        response: "<binary>",
      },
      {
        method: "GET",
        path: "/api/files/{file_id}",
        auth: "jwt",
        summary: "Metadata file.",
        response: `{ "id": "...", "file_name": "...", "file_type": "image", "file_size": 271313, ... }`,
      },
    ],
  },
  {
    title: "API Keys (gọi từ máy ngoài)",
    endpoints: [
      {
        method: "POST",
        path: "/api/api-keys",
        auth: "jwt",
        summary: "Tạo API key cho user. Trả về raw key DUY NHẤT 1 lần khi tạo.",
        request: `{
  "name": "production-server",
  "allowed_providers": ["grok"],
  "allowed_job_types": ["image"],
  "rate_limit_per_minute": 60,
  "daily_limit": 1000,
  "expires_at": null
}`,
        response: `{
  "id": "...",
  "raw_key": "uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "key_prefix": "uxpm_live_xxxx",
  "name": "production-server"
}`,
      },
      {
        method: "POST",
        path: "/v1/jobs/image",
        auth: "apikey",
        summary: "Public API endpoint dùng API key. Tương đương POST /api/jobs với provider/job_type tự động.",
        request: `{
  "prompt": "A modern dashboard",
  "options": { "aspect": "16:9", "quality": "quality" }
}`,
        response: `{ "id": "...", "status": "queued", ... }`,
      },
      {
        method: "GET",
        path: "/v1/jobs/{job_id}",
        auth: "apikey",
        summary: "Polling status từ máy ngoài.",
        response: "<JobOut>",
      },
    ],
  },
  {
    title: "Webhooks",
    endpoints: [
      {
        method: "PATCH",
        path: "/api/auth/me/webhook",
        auth: "jwt",
        summary: "Set webhook URL nhận event job.success / job.failed / job.cancelled.",
        request: `{
  "webhook_url": "https://your.app/grokflow-callback",
  "webhook_secret": "your-shared-secret"
}`,
        response: "<UserResponse>",
        notes:
          "Webhook payload: { event, job_id, user_id, status, result_url, error_message, signature }. Verify HMAC-SHA256 với webhook_secret.",
      },
    ],
  },
];

const BADGES: Record<Endpoint["auth"], { label: string; cls: string }> = {
  jwt:    { label: "JWT",   cls: "bg-blue-100 text-blue-700" },
  apikey: { label: "APIKEY", cls: "bg-purple-100 text-purple-700" },
  admin:  { label: "ADMIN", cls: "bg-rose-100 text-rose-700" },
  any:    { label: "PUBLIC", cls: "bg-slate-100 text-slate-700" },
};

const METHOD_CLS: Record<Endpoint["method"], string> = {
  GET:    "bg-emerald-100 text-emerald-700",
  POST:   "bg-blue-100 text-blue-700",
  PATCH:  "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs whitespace-pre overflow-x-auto">
      {children}
    </pre>
  );
}

function EndpointCard({ ep, apiBase }: { ep: Endpoint; apiBase: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50"
      >
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${METHOD_CLS[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-sm font-mono">{ep.path}</code>
        <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold ${BADGES[ep.auth].cls}`}>
          {BADGES[ep.auth].label}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▼" : "▶"}</span>
      </button>
      <p className="px-3 pb-2 text-sm text-slate-600">{ep.summary}</p>
      {open && (
        <div className="border-t px-3 py-3 space-y-3 bg-slate-50">
          {ep.query && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">QUERY</div>
              <code className="text-xs">{`${apiBase}${ep.path}${ep.query}`}</code>
            </div>
          )}
          {ep.request && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">REQUEST</div>
              <CodeBlock>{ep.request}</CodeBlock>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">RESPONSE</div>
            <CodeBlock>{ep.response}</CodeBlock>
          </div>
          {ep.notes && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {ep.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ApiDocsPage() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">API Reference</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tất cả endpoint dùng JSON. Click vào endpoint để xem request/response cụ thể.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Authentication</h2>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="border-l-4 border-blue-400 pl-3">
            <div className="font-semibold text-blue-700 mb-1">JWT (web UI)</div>
            <p className="text-slate-600">Login → token 24h → Header:</p>
            <code className="text-xs">Authorization: Bearer eyJhbGc...</code>
          </div>
          <div className="border-l-4 border-purple-400 pl-3">
            <div className="font-semibold text-purple-700 mb-1">API Key (SDK / server)</div>
            <p className="text-slate-600">Tạo trong tab API Keys, dùng:</p>
            <code className="text-xs">Authorization: Bearer uxpm_live_xxx</code>
          </div>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Quick start</h2>
        <CodeBlock>{`# 1. Login lấy JWT
curl -X POST ${apiBase}/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"admin@example.com","password":"..."}'

# 2. Tạo job
TOKEN="eyJhbGc..."
curl -X POST ${apiBase}/api/jobs \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "provider":"grok","job_type":"image",
    "prompt":"A cyberpunk Tokyo street at night",
    "options":{"aspect":"16:9","quality":"speed"}
  }'

# 3. Polling status (mỗi 2-3s)
curl ${apiBase}/api/jobs/<job_id> -H "Authorization: Bearer $TOKEN"

# 4. Khi success, tải file
curl -o out.jpg \\
  ${apiBase}/api/files/<file_id>/download \\
  -H "Authorization: Bearer $TOKEN"`}</CodeBlock>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="card space-y-2">
          <h2 className="font-semibold">{g.title}</h2>
          <div className="space-y-2">
            {g.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} apiBase={apiBase} />
            ))}
          </div>
        </section>
      ))}

      <section className="card space-y-2">
        <h2 className="font-semibold">Error codes</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs uppercase">
            <tr>
              <th className="py-1">HTTP</th><th>Code</th><th>Mô tả</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="py-1.5 pr-4 font-mono">401</td><td className="font-mono">invalid_credentials</td><td>Email/password sai hoặc token hết hạn.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">401</td><td className="font-mono">invalid_api_key</td><td>API key sai/revoked.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">403</td><td className="font-mono">permission_denied</td><td>User không có role admin / key không có quyền provider.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">404</td><td className="font-mono">job_not_found</td><td>Job không tồn tại / không thuộc về bạn.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">409</td><td className="font-mono">profile_busy</td><td>Tất cả slot của profile đã đầy.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">422</td><td className="font-mono">invalid_payload</td><td>Body không đúng schema.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">429</td><td className="font-mono">rate_limited</td><td>Vượt rate limit của API key.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Job error_message format</h2>
        <p className="text-sm text-slate-600">
          Trường <code>error_message</code> trên job có dạng <code>[code] message</code>. Code có thể là:
        </p>
        <ul className="text-sm text-slate-600 space-y-0.5">
          <li><code>cookie_expired</code> — admin cần Auto-login lại profile.</li>
          <li><code>captcha_required</code> — admin mở VNC giải captcha thủ công.</li>
          <li><code>provider_blocked</code> — account không có quyền (cần Pro/Heavy).</li>
          <li><code>rate_limited</code> — account bị throttle, retry sau 2-30 phút.</li>
          <li><code>browser_crashed</code> / <code>network_error</code> / <code>timeout</code> — retryable, sẽ tự retry.</li>
          <li><code>retries_exhausted</code> — đã hết max_retry, dùng /retry để tăng cap.</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">OpenAPI / Swagger</h2>
        <p className="text-sm text-slate-600">
          Schema đầy đủ tại{" "}
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
            {apiBase}/docs
          </a>{" "}
          (Swagger UI) hoặc{" "}
          <a href={`${apiBase}/redoc`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
            {apiBase}/redoc
          </a>{" "}
          (ReDoc).
        </p>
      </section>
    </div>
  );
}
