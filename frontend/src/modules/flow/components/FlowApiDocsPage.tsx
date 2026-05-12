import { FileText, ExternalLink } from "lucide-react";

/** Lightweight "what is this?" page for the Flow video tools — links out to
 *  upstream Swagger docs hosted on the flow-api container. Not a full
 *  reference, just enough to point developers at the source of truth. */
export function FlowApiDocsPage() {
  const tools = [
    { slug: "cut", label: "Cắt video", endpoint: "POST /api/v1/video/cut" },
    { slug: "merge", label: "Ghép video", endpoint: "POST /api/v1/video/merge" },
    { slug: "extract-audio", label: "Tách âm thanh", endpoint: "POST /api/v1/video/extract-audio" },
    { slug: "add-audio", label: "Ghép/thay audio", endpoint: "POST /api/v1/video/add-audio" },
    { slug: "speed", label: "Đổi tốc độ", endpoint: "POST /api/v1/video/speed" },
    { slug: "resize", label: "Resize", endpoint: "POST /api/v1/video/resize" },
    { slug: "crop", label: "Crop", endpoint: "POST /api/v1/video/crop" },
    { slug: "extract-frames", label: "Trích xuất frame", endpoint: "POST /api/v1/video/extract-frames" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <FileText className="h-6 w-6 text-blue-600" />
          Flow API Reference
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bộ công cụ xử lý video chạy trên FFmpeg. UI ở các trang còn lại đã
          bọc sẵn API — phần này dành cho dev muốn gọi trực tiếp.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Luồng cơ bản</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/flow/upload</code>
            {" — multipart files + tool_name → trả về job_id."}
          </li>
          <li>
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              POST /api/flow/run/&lt;tool&gt;
            </code>
            {" — gửi job_id + params (cut: start_time/end_time; resize: width/height; v.v.)."}
          </li>
          <li>
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">GET /api/flow/jobs/{`{id}`}</code>
            {" — poll mỗi 2s đến khi status = completed/failed."}
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Tools</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-2">Tên</th>
              <th className="py-2">Upstream endpoint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tools.map((t) => (
              <tr key={t.slug}>
                <td className="py-2 font-medium text-slate-700">{t.label}</td>
                <td className="py-2 text-xs text-slate-500">
                  <code className="rounded bg-slate-100 px-1 py-0.5">{t.endpoint}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Giới hạn</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>File &le; 500 MB mỗi file (tuỳ <code className="text-xs">FLOW_MAX_UPLOAD_MB</code>).</li>
          <li>Job timeout 10 phút — video dài cần cắt nhỏ trước khi merge.</li>
          <li>Output lưu local trên VPS; setup R2 để serve qua CDN xem doc <code className="text-xs">docs/FLOW-SETUP.md</code>.</li>
        </ul>
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Swagger upstream
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>
    </div>
  );
}
