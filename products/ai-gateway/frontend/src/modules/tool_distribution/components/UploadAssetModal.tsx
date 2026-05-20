import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, File as FileIcon, X } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { toolsService } from "../services/tools.service";
import type { Tool, AssetKind } from "../models/tool";
import { KIND_META } from "../models/tool";


/** Upload a new asset (installer / doc) for a tool. The kind is fixed
 *  by the page that opened the modal — admin can't accidentally upload
 *  a Windows installer into the Mac bucket from this dialog. */
export function UploadAssetModal({
  tool, kind, onClose, onUploaded,
}: {
  tool: Tool;
  kind: AssetKind;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [isLatest, setIsLatest] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("file required");
      return toolsService.uploadAsset(tool.id, {
        file,
        kind,
        label: label.trim(),
        version: version.trim() || undefined,
        notes: notes.trim() || undefined,
        is_latest: isLatest,
      });
    },
    onSuccess: () => {
      toast("Upload thành công", "success");
      onUploaded();
      onClose();
    },
    onError: (e: { response?: { data?: { detail?: { message?: string } } } }) =>
      toast(e?.response?.data?.detail?.message ?? "Upload thất bại", "error"),
  });

  const meta = KIND_META[kind];
  const canSubmit = file !== null && label.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Upload {meta.label} cho <span className="text-blue-600">{tool.name}</span>
          </h2>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
            kind: <strong>{kind}</strong> · tool_code: {tool.code}
          </p>
        </div>

        {/* File picker — pretty drop zone */}
        <div>
          <label className="text-sm font-medium text-slate-700">File</label>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                // Auto-suggest a label from the filename (admin can edit).
                if (!label) setLabel(f.name);
              }
              e.target.value = "";
            }}
          />
          {file ? (
            <div className="mt-1 flex items-center gap-3 p-3 rounded-lg bg-slate-50 ring-1 ring-slate-200">
              <FileIcon size={28} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{file.name}</div>
                <div className="text-[10px] text-slate-500">{formatBytes(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-slate-400 hover:text-rose-600 p-1"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 w-full p-6 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors text-center"
            >
              <Upload size={20} className="mx-auto text-slate-400 mb-1" />
              <div className="text-sm text-slate-600">Click chọn file</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Tối đa 500MB</div>
            </button>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Label hiển thị</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`${tool.name} ${meta.label} Setup`}
            className="input mt-1"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Tên người dùng thấy trong list, vd "Setup x64".
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Version (tuỳ chọn)</label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            className="input mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Release notes (tuỳ chọn)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Fix bug abc, thêm tính năng xyz..."
            className="input mt-1 resize-none"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isLatest}
            onChange={(e) => setIsLatest(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-sm font-medium text-slate-700">Đánh dấu Latest</span>
            <span className="block text-[10px] text-slate-500">
              Các bản trước trong cùng {meta.label} sẽ bị bỏ flag Latest. Khách hàng tải bản này khi click "Download latest".
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost" disabled={upload.isPending}>
            Huỷ
          </button>
          <button
            onClick={() => upload.mutate()}
            disabled={!canSubmit || upload.isPending}
            className="btn-primary"
          >
            {upload.isPending ? "Đang upload..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}


function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
