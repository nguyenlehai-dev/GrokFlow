import { useState } from "react";
import { Copy, Check, KeyRound, FileText, ExternalLink } from "lucide-react";

import { toast } from "@/components/ui/Toast";

/** Developer-facing API reference for the Flow video tools.
 *
 *  Layout mirrors the plxeditor.com docs style — for each tool: method
 *  badge, endpoint, description, params table, curl request example,
 *  JSON response example. Driven by a single `SPECS` array so adding a
 *  tool means appending one entry, not editing JSX. */

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

/** Hard-coded base used in the examples. The real value comes from
 *  GrokFlow's auth — examples show the public URL the user actually hits.
 *  Switch to a host-aware string if/when we run flow-api on a separate
 *  origin. */
const BASE = "https://flowgrok.vpspanel.io.vn";

const SPECS: ToolSpec[] = [
  {
    method: "POST",
    endpoint: "/api/flow/upload",
    title: "1. Upload Inputs",
    description:
      "Bước 1 luôn cần: gửi 1 hoặc nhiều file đầu vào kèm `tool_name` để tạo job. Trả về job_id dùng cho mọi bước sau.",
    params: [
      { name: "tool_name", type: "string", required: true, desc: "Một trong các slug bên dưới: cut, merge, extract-audio, …" },
      { name: "files", type: "file[]", required: true, desc: "Multipart files. Tối thiểu 1, tối đa 10. Định dạng tuỳ tool." },
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
    endpoint: "/api/flow/run/cut",
    title: "2. Cut Video",
    description: "Cắt một đoạn từ video gốc theo mốc thời gian HH:MM:SS.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Trả về từ /api/flow/upload." },
      { name: "start_time", type: "string", required: true, desc: "Mốc bắt đầu, định dạng HH:MM:SS hoặc giây thập phân." },
      { name: "end_time", type: "string", required: true, desc: "Mốc kết thúc. Phải > start_time." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/cut' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'start_time=00:00:05' \\
  -F 'end_time=00:00:15'`,
    responseExample: `{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "operation": "cut",
  "status": "pending",
  "progress": 0.0,
  "output_url": null,
  "created_at": "2026-05-13T08:12:00Z"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/merge",
    title: "3. Merge Multiple Videos",
    description: "Nối nhiều video thành 1 file theo thứ tự upload. Tất cả file phải cùng codec để dùng concat copy nhanh.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job phải có 2-10 input files." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/merge' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "merge",
  "status": "pending",
  "progress": 0.0
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/add-audio",
    title: "4. Merge / Replace Audio",
    description: "File 1 = video, file 2 = audio mới. Bật replace để thay sạch audio cũ, tắt để mix thêm vào audio gốc.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job upload với đúng 2 files (video, audio)." },
      { name: "replace", type: "boolean", desc: "true = thay sạch; false (mặc định) = mix audio mới vào audio gốc." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/add-audio' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'replace=true'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "add-audio",
  "status": "pending"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/extract-audio",
    title: "5. Extract Audio",
    description: "Tách audio track từ video sang MP3 / WAV / AAC.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "format", type: "string", desc: "mp3 (mặc định) | wav | aac." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/extract-audio' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'format=mp3'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "extract-audio",
  "status": "pending"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/speed",
    title: "6. Change Video Speed",
    description: "Tăng/giảm tốc độ playback. 0.5 = chậm 2×, 2.0 = nhanh 2×. Audio cũng được điều chỉnh nếu adjust_audio=true.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "speed", type: "float", required: true, desc: "Khoảng 0.25 đến 4.0. Giá trị ngoài sẽ làm méo nặng." },
      { name: "adjust_audio", type: "boolean", desc: "Mặc định true. Tắt = audio giữ nguyên (lệch lip-sync)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/speed' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'speed=1.5' \\
  -F 'adjust_audio=true'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "speed",
  "status": "pending"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/resize",
    title: "7. Resize Video",
    description: "Đổi kích thước video. Mặc định giữ aspect ratio và pad nếu lệch tỷ lệ.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "width", type: "int", required: true, desc: "Chiều rộng pixel mục tiêu." },
      { name: "height", type: "int", required: true, desc: "Chiều cao pixel mục tiêu." },
      { name: "maintain_aspect", type: "boolean", desc: "Mặc định true. Tắt = stretch méo." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/resize' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'width=1280' \\
  -F 'height=720'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "resize",
  "status": "pending"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/crop",
    title: "8. Crop Video",
    description: "Cắt vùng hiển thị theo toạ độ (x, y) gốc trên trái và kích thước (width, height).",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "width", type: "int", required: true, desc: "Width vùng cắt." },
      { name: "height", type: "int", required: true, desc: "Height vùng cắt." },
      { name: "x", type: "int", desc: "Offset X từ gốc trái (mặc định 0)." },
      { name: "y", type: "int", desc: "Offset Y từ gốc trên (mặc định 0)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/crop' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'width=640' \\
  -F 'height=360' \\
  -F 'x=100' \\
  -F 'y=50'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "crop",
  "status": "pending"
}`,
  },
  {
    method: "POST",
    endpoint: "/api/flow/run/extract-frames",
    title: "9. Extract Frames",
    description: "Trích xuất khung hình về PNG. Bật first_frame/last_frame hoặc đưa timestamp (giây) để lấy 1 frame cụ thể.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Job 1 file video." },
      { name: "first_frame", type: "boolean", desc: "Lấy frame đầu video." },
      { name: "last_frame", type: "boolean", desc: "Lấy frame cuối video." },
      { name: "timestamp", type: "float", desc: "Lấy frame tại giây thứ X (ưu tiên hơn first/last)." },
    ],
    requestExample: `curl -X POST '${BASE}/api/flow/run/extract-frames' \\
  -H 'Authorization: Bearer YOUR_JWT' \\
  -F 'job_id=f47ac10b-…' \\
  -F 'timestamp=3.5'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "extract-frames",
  "status": "pending"
}`,
  },
  {
    method: "GET",
    endpoint: "/api/flow/jobs",
    title: "10. List All Jobs",
    description: "Liệt kê tất cả job (đang xử lý + đã hoàn tất) của bạn. Phân trang qua skip/limit.",
    params: [
      { name: "skip", type: "int", desc: "Bỏ qua N job đầu. Mặc định 0." },
      { name: "limit", type: "int", desc: "Số job mỗi page. Mặc định 50, tối đa 50." },
    ],
    requestExample: `curl '${BASE}/api/flow/jobs?skip=0&limit=20' \\
  -H 'Authorization: Bearer YOUR_JWT'`,
    responseExample: `{
  "jobs": [
    {
      "id": "f47ac10b-…",
      "operation": "cut",
      "status": "completed",
      "progress": 100.0,
      "output_url": "/flow-output/cut_f47ac10b.mp4",
      "created_at": "2026-05-13T08:12:00Z",
      "completed_at": "2026-05-13T08:12:18Z",
      "duration": 18.4
    }
  ],
  "total": 1
}`,
  },
  {
    method: "GET",
    endpoint: "/api/flow/jobs/{job_id}",
    title: "11. Check Job Status (Polling)",
    description:
      "Kiểm tra status + progress của 1 job. Khi xong status sẽ là 'completed' kèm output_url để tải. UI mặc định poll mỗi 2s.",
    params: [
      { name: "job_id", type: "string", required: true, desc: "Path param. ID trả về từ bước upload/run." },
    ],
    requestExample: `curl '${BASE}/api/flow/jobs/f47ac10b-…' \\
  -H 'Authorization: Bearer YOUR_JWT'`,
    responseExample: `{
  "id": "f47ac10b-…",
  "operation": "cut",
  "status": "completed",
  "progress": 100.0,
  "output_url": "/flow-output/cut_f47ac10b.mp4",
  "output_filename": "cut_f47ac10b.mp4",
  "file_size": 4823104,
  "duration": 18.4,
  "completed_at": "2026-05-13T08:12:18Z",
  "error_message": null
}`,
  },
];

function MethodBadge({ method }: { method: "POST" | "GET" }) {
  const palette =
    method === "POST"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-blue-100 text-blue-700 ring-blue-200";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ring-1 ${palette}`}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: "bash" | "json" }) {
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
        <code className={`language-${lang}`}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 opacity-0 transition hover:bg-slate-700 group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ToolCard({ spec }: { spec: ToolSpec }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Parameters
          </h4>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
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
                        <span className="ml-1.5 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium uppercase text-rose-600">
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Request Example
          </h4>
          <div className="mt-2">
            <CodeBlock code={spec.requestExample} lang="bash" />
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Response Format
          </h4>
          <div className="mt-2">
            <CodeBlock code={spec.responseExample} lang="json" />
          </div>
        </div>
      </section>
    </article>
  );
}

function ApiKeyPanel() {
  const [revealed, setRevealed] = useState(false);
  // The browser never sees the upstream flow-api key — auth piggybacks on
  // the GrokFlow JWT instead. Show the JWT helper text so devs know what to
  // send. If users actually want to drive the upstream service directly,
  // they should generate one via /admin → API Keys.
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">Developer API Key</h2>
      </header>
      <p className="mt-2 text-sm text-slate-500">
        Mọi request gửi vào <code className="text-xs">/api/flow/*</code> đều dùng GrokFlow JWT
        token qua header{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">Authorization: Bearer …</code>.
        Backend tự inject <code>X-API-Key</code> cho flow-api ở phía server.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={
            revealed
              ? "(lấy JWT từ /admin/api-keys hoặc devtools → localStorage.auth)"
              : "•••••••••••••••••••••••••••••••••••••"
          }
          className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {revealed ? "Ẩn" : "Hiện"}
        </button>
      </div>
    </section>
  );
}

export function FlowApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="flex items-center gap-3 text-2xl font-semibold text-slate-900">
          <FileText className="h-6 w-6 text-blue-600" />
          API Documentation
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bộ công cụ xử lý video qua FFmpeg. Tất cả endpoints dưới đây đi qua proxy{" "}
          <code className="text-xs">/api/flow/*</code> nên không cần X-API-Key — chỉ JWT.
        </p>
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Swagger upstream (flow-api internal)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <ApiKeyPanel />

      {SPECS.map((s) => (
        <ToolCard key={s.endpoint + s.method} spec={s} />
      ))}
    </div>
  );
}
