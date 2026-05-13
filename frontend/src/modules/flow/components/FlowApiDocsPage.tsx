import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { FlowShell } from "./FlowShell";

/** Developer-facing API reference for the Flow video tools — dark theme,
 *  per-tool card with method badge, params table, request + response
 *  examples. Driven by a single `SPECS` array; adding a tool = appending
 *  one entry, not editing JSX. */

type ParamRow = { name: string; type: string; required?: boolean; desc: string };
type ToolSpec = {
  method: "POST" | "GET";
  endpoint: string;
  title: string;
  description: string;
  params: ParamRow[];
  requestExample: string;
  responseExample: string;
};

const BASE = "https://flowgrok.vpspanel.io.vn";

const SPECS: ToolSpec[] = [
  {
    method: "POST",
    endpoint: "/api/flow/upload",
    title: "1. Upload Inputs",
    description:
      "Step 1 — luôn gọi đầu tiên. Gửi 1+ file đầu vào kèm tool_name, trả về job_id dùng cho bước run.",
    params: [
      { name: "tool_name", type: "string", required: true, desc: "Slug: cut, merge, extract-audio, …" },
      { name: "files", type: "file[]", required: true, desc: "Multipart files (1-10 tuỳ tool)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/upload' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'tool_name=cut' \\
  -F 'files=@input.mp4'`,
    responseExample: `{
  "job_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "input_files": [
    { "filename": "input.mp4", "object_key": "local:f47a…/input.mp4" }
  ],
  "backend": "local"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/upload-url",
    title: "1b. Upload Inputs (URL bypass)",
    description:
      "Skip multipart bằng cách đưa URL pre-hosted. Hỗ trợ R2 (r2.dev), plxeditor.com, plenxai.com. Local-mode flow-api sẽ từ chối.",
    params: [
      { name: "tool_name", type: "string", required: true, desc: "Slug tool (giống /upload)." },
      { name: "urls", type: "string[]", required: true, desc: "Danh sách URL cần xử lý." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/upload-url' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -H 'Content-Type: application/json' \\
  -d '{"tool_name":"cut","urls":["https://pub-xxx.r2.dev/input/clip.mp4"]}'`,
    responseExample: `{
  "job_id": "f47ac10b-…",
  "input_files": [{ "filename": "clip.mp4", "object_key": "input/clip.mp4" }],
  "backend": "r2"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/cut",
    title: "2. Cut Video",
    description: "Cắt đoạn từ video gốc theo HH:MM:SS.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Trả về từ /upload." },
      { name: "start_time", type: "string", required: true, desc: "Mốc bắt đầu HH:MM:SS." },
      { name: "end_time", type: "string", required: true, desc: "Mốc kết thúc HH:MM:SS." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/cut' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'start_time=00:00:05' \\
  -F 'end_time=00:00:15'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "cut",
  "status": "pending",
  "progress": 0.0
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/merge",
    title: "3. Merge Multiple Videos",
    description: "Nối nhiều video thành 1 file theo thứ tự upload.",
    params: [{ name: "job_id", type: "string", required: true, desc: "Job phải có 2-10 input files." }],
    requestExample: `curl -X POST '${BASE}/api/flow/run/merge' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…'`,
    responseExample: `{"id":"f47ac10b-…","operation":"merge","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/add-audio",
    title: "4. Merge / Replace Audio",
    description: "File 1 = video, file 2 = audio. Bật replace=true để thay sạch, false để mix.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job upload với 2 files." },
      { name: "replace", type: "boolean", desc: "true = thay sạch; false = mix (default)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/add-audio' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'replace=true'`,
    responseExample: `{"id":"f47ac10b-…","operation":"add-audio","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/extract-audio",
    title: "5. Extract Audio",
    description: "Tách audio track sang MP3/WAV/AAC. Default mp3.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "format", type: "string", desc: "mp3 | wav | aac." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/extract-audio' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'format=mp3'`,
    responseExample: `{"id":"f47ac10b-…","operation":"extract-audio","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/speed",
    title: "6. Change Video Speed",
    description: "0.5 = chậm 2×, 2.0 = nhanh 2×. Audio cũng điều chỉnh theo.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "speed", type: "float", required: true, desc: "Khoảng 0.25 - 4.0." },
      { name: "adjust_audio", type: "boolean", desc: "Default true." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/speed' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'speed=1.5'`,
    responseExample: `{"id":"f47ac10b-…","operation":"speed","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/resize",
    title: "7. Resize Video",
    description: "Đổi kích thước. Mặc định giữ aspect ratio.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "width", type: "int", required: true, desc: "Pixel mục tiêu." },
      { name: "height", type: "int", required: true, desc: "Pixel mục tiêu." },
      { name: "maintain_aspect", type: "boolean", desc: "Default true." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/resize' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'width=1280' \\
  -F 'height=720'`,
    responseExample: `{"id":"f47ac10b-…","operation":"resize","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/crop",
    title: "8. Crop Video",
    description: "Cắt vùng theo (x, y) gốc trái và (width, height).",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "width", type: "int", required: true, desc: "Width vùng cắt." },
      { name: "height", type: "int", required: true, desc: "Height vùng cắt." },
      { name: "x", type: "int", desc: "Offset X (default 0)." },
      { name: "y", type: "int", desc: "Offset Y (default 0)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/crop' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'width=640' \\
  -F 'height=360' \\
  -F 'x=100' \\
  -F 'y=50'`,
    responseExample: `{"id":"f47ac10b-…","operation":"crop","status":"pending"}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/extract-frames",
    title: "9. Extract Frames",
    description: "Trích PNG. timestamp ưu tiên hơn first/last_frame.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "first_frame", type: "boolean", desc: "Lấy frame đầu." },
      { name: "last_frame", type: "boolean", desc: "Lấy frame cuối." },
      { name: "timestamp", type: "float", desc: "Giây thứ X." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/extract-frames' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'timestamp=3.5'`,
    responseExample: `{"id":"f47ac10b-…","operation":"extract-frames","status":"pending"}`,
  },
  {
    method: "GET",
    endpoint: "/api/flow/jobs",
    title: "10. List All Jobs",
    description: "Liệt kê tất cả job của bạn. Phân trang qua skip/limit.",
    params: [
      { name: "skip", type: "int", desc: "Default 0." },
      { name: "limit", type: "int", desc: "Default 50, max 50." },
    ],
    requestExample: `curl '${BASE}/api/flow/jobs?skip=0&limit=20' \\
  -H 'Authorization: Bearer YOUR_JWT'`,
    responseExample: `{
  "jobs": [{
    "id": "f47ac10b-…",
    "operation": "cut",
    "status": "completed",
    "progress": 100.0,
    "output_url": "/flow-output/cut_f47ac10b.mp4",
    "created_at": "2026-05-13T08:12:00Z",
    "duration": 18.4
  }],
  "total": 1
}`,
  },
  {
    method: "GET",
    endpoint: "/api/flow/jobs/{job_id}",
    title: "11. Check Job Status (Polling)",
    description: "UI mặc định poll mỗi 2s đến khi status = completed/failed.",
    params: [{ name: "job_id", type: "string", required: true, desc: "Path param. ID từ /upload." }],
    requestExample: `curl '${BASE}/api/flow/jobs/f47ac10b-…' \\
  -H 'Authorization: Bearer YOUR_JWT'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "status": "completed",
  "progress": 100.0,
  "output_url": "/flow-output/cut_f47ac10b.mp4",
  "file_size": 4823104,
  "duration": 18.4
}`,
  },
];

function MethodBadge({ method }: { method: "POST" | "GET" }) {
  const palette =
    method === "POST"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-sky-100 text-sky-700 ring-sky-200";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ring-1 ${palette}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Không copy được", "error");
    }
  };
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] text-slate-300 opacity-0 transition hover:bg-slate-700 group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ToolCard({ spec }: { spec: ToolSpec }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <MethodBadge method={spec.method} />
          <code className="text-sm font-semibold text-slate-800">{spec.endpoint}</code>
        </div>
        <h3 className="mt-2 text-base font-semibold text-slate-900">{spec.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{spec.description}</p>
      </header>

      {spec.params.length > 0 && (
        <section className="px-5 py-4">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            Parameters
          </h4>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spec.params.map((p) => (
                  <tr key={p.name}>
                    <td className="px-3 py-2 align-top">
                      <code className="text-xs font-semibold text-slate-800">{p.name}</code>
                      {p.required && (
                        <span className="ml-1.5 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-bold uppercase text-rose-600">
                          required
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">
                      <code>{p.type}</code>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-600">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3 px-5 py-4">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            Request Example
          </h4>
          <div className="mt-2">
            <CodeBlock code={spec.requestExample} />
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            Response Format
          </h4>
          <div className="mt-2">
            <CodeBlock code={spec.responseExample} />
          </div>
        </div>
      </section>
    </article>
  );
}

export function FlowApiDocsPage() {
  return (
    <FlowShell workspaceLabel="API Documentation">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Bộ công cụ xử lý video qua FFmpeg. Tất cả endpoints dưới đây đi qua proxy{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
            /api/flow/*
          </code>{" "}
          — chỉ cần GrokFlow JWT, không cần X-API-Key.
        </p>
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700"
        >
          Swagger upstream (flow-api internal)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {SPECS.map((s) => (
          <ToolCard key={s.endpoint + s.method} spec={s} />
        ))}
      </div>
    </FlowShell>
  );
}
