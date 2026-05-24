import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { FlowShell } from "../components/FlowShell";

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

// Use the user's current origin so cURL examples always work — every
// tenant vhost (plxeditor.com, flowgrok.plxeditor.com, …) routes
// /api/flow/* to the same backend. The previous hardcoded
// `flowgrok.vpspanel.io.vn` was a stale domain that no longer resolves,
// so partners copying cURL from these docs hit `getaddrinfo failed`.
const BASE =
  typeof window !== "undefined" ? window.location.origin : "https://your-grokflow-host";

const SPECS: ToolSpec[] = [
  {
    method: "POST",
    endpoint: "/api/v1/video/cut",
    title: "Cut Video",
    description: "Trim a segment from a video using start and end timestamps.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if video_url/job_id is provided)" },
      { name: "video_url", type: "String", desc: "Alternatively, a direct video URL (e.g. CDN link)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "start_time", type: "String", desc: "Start time (HH:MM:SS or seconds)" },
      { name: "end_time", type: "String", desc: "End time (HH:MM:SS or seconds)" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/cut' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'start_time=00:00:10' \
  -F 'end_time=00:00:30'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/merge",
    title: "Merge Multiple Videos",
    description: "Merge or concatenate multiple video files together in sequence.",
    params: [
      { name: "videos", type: "File[]", desc: "Multiple video files (optional if job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/merge' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'videos=@part1.mp4' \
  -F 'videos=@part2.mp4'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/add-audio",
    title: "Merge Audio Into Video",
    description: "Add or replace the audio track in a video with a secondary audio file.",
    params: [
      { name: "video", type: "File", required: true, desc: "Primary video file" },
      { name: "audio", type: "File", desc: "Secondary audio file" },
      { name: "replace", type: "Boolean", desc: "If true, replaces existing audio. False will mix/merge them." },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/add-audio' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@video.mp4' \
  -F 'audio=@audio.mp3' \
  -F 'replace=false'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/crop",
    title: "Crop Video",
    description: "Crop a video visually to specified dimensions and offsets.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if video_url/job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "width", type: "Integer", required: true, desc: "Crop width in pixels" },
      { name: "height", type: "Integer", required: true, desc: "Crop height in pixels" },
      { name: "x", type: "Integer", desc: "Horizontal offset from left (px)" },
      { name: "y", type: "Integer", desc: "Vertical offset from top (px)" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/crop' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'width=1080' \
  -F 'height=1080' \
  -F 'x=0' \
  -F 'y=0'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/extract-audio",
    title: "Extract Audio",
    description: "Extract the audio track from a video file into a specified format.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "format", type: "String", desc: "Output audio format (mp3, wav, aac, flac)" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/extract-audio' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'format=mp3'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/speed",
    title: "Change Video Speed",
    description: "Change the playback speed of a video.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "speed", type: "Float", required: true, desc: "Speed multiplier (0.25 to 4.0)" },
      { name: "adjust_audio", type: "Boolean", desc: "Whether to adjust audio speed accordingly" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/speed' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'speed=2.0' \
  -F 'adjust_audio=true'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/resize",
    title: "Resize Video",
    description: "Resize a video to specified dimensions.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "width", type: "Integer", required: true, desc: "Target width" },
      { name: "height", type: "Integer", required: true, desc: "Target height" },
      { name: "maintain_aspect", type: "Boolean", desc: "Maintain aspect ratio (pad if necessary)" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/resize' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'width=1280' \
  -F 'height=720' \
  -F 'maintain_aspect=true'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "POST",
    endpoint: "/api/v1/video/extract-frames",
    title: "Extract Frames",
    description: "Extract specific frames from a video. At least one of first_frame / last_frame / timestamp is required.",
    params: [
      { name: "video", type: "File", desc: "Video file (optional if job_id is provided)" },
      { name: "job_id", type: "String", desc: "Alternatively, an existing Job ID" },
      { name: "first_frame", type: "Boolean", desc: "Extract the first frame" },
      { name: "last_frame", type: "Boolean", desc: "Extract the last frame" },
      { name: "timestamp", type: "Float", desc: "Extract frame at specific second (e.g. 5.5)" },
    ],
    requestExample: `curl -X POST '${BASE}/api/v1/video/extract-frames' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'video=@input.mp4' \
  -F 'first_frame=true' \
  -F 'timestamp=5.5'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "pending",
  "message": "Processing job queued.",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": null
}`,
  },
  {
    method: "GET",
    endpoint: "/api/v1/video/jobs",
    title: "List All Jobs",
    description: "List all processing jobs for the current API Key account.",
    params: [
      { name: "skip", type: "Integer", desc: "Pagination offset" },
      { name: "limit", type: "Integer", desc: "Pagination limit (default 50, max 200)" },
    ],
    requestExample: `curl -X GET '${BASE}/api/v1/video/jobs?skip=0&limit=50' \
  -H 'X-API-Key: YOUR_API_KEY'`,
    responseExample: `[
  {
    "id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
    "operation": "cut",
    "status": "completed",
    "progress": 100.0,
    "error_message": null,
    "output_url": "https://cdn.plxeditor.com/output/xyz.mp4",
    "created_at": "2026-04-07T03:33:30.000Z",
    "completed_at": "2026-04-07T03:34:10.000Z"
  }
]`,
  },
  {
    method: "GET",
    endpoint: "/api/v1/video/jobs/{job_id}",
    title: "Check Job Status (Polling)",
    description: "Check the status of a scheduled processing job. Returns status (pending, processing, completed, failed) and output URL.",
    params: [],
    requestExample: `curl -X GET '${BASE}/api/v1/video/jobs/YOUR_JOB_ID' \
  -H 'X-API-Key: YOUR_API_KEY'`,
    responseExample: `{
  "job_id": "a9b92426-cc0f-412c-bd2a-fe8ef3283e58",
  "status": "completed",
  "message": "job completed",
  "thumbnail_url": null,
  "has_audio": null,
  "output_duration": 16.02
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
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] text-slate-9000 opacity-0 transition hover:bg-slate-700 group-hover:opacity-100"
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
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <MethodBadge method={spec.method} />
          <code className="text-sm font-semibold text-slate-800">{spec.endpoint}</code>
        </div>
        <h3 className="mt-2 text-base font-semibold text-white">{spec.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{spec.description}</p>
      </header>

      {spec.params.length > 0 && (
        <section className="px-5 py-4">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            Parameters
          </h4>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-white">
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
              <tbody className="divide-y divide-slate-200">
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
          Bộ công cụ xử lý video qua FFmpeg, public v1 API dưới{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
            /api/v1/video/*
          </code>{" "}
          — auth qua header <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">X-API-Key</code> (Bearer JWT cũng được chấp nhận cho compat).
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="mb-1 font-medium">Cách lấy <code className="text-xs">YOUR_API_KEY</code>: vào <strong>API Keys</strong> ở sidebar → Create → copy. Hoặc dùng JWT qua login API:</div>
          <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{`curl -X POST '${BASE}/api/auth/login' \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"you@example.com","password":"..."}'
# → trả về { "access_token": "eyJ…", "expires_in": 86400 }`}</pre>
          <div className="mt-1 text-xs text-slate-500">
            JWT có hiệu lực 24h. Re-login khi hết hạn (server trả 401 → frontend đã có axios retry interceptor bảo vệ deploy nhưng KHÔNG retry 401).
          </div>
        </div>
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
