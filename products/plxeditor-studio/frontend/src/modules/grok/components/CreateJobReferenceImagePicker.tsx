import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Image as ImageIcon, Lock, X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { jobsService } from "../services/jobs.service";

export interface InputImage {
  file_id: string;
  preview: string;
}

export function CreateJobReferenceImagePicker({
  jobType, allowed, value, onChange,
}: {
  jobType: "image" | "video";
  allowed: boolean;
  value: InputImage | null;
  onChange: (v: InputImage | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadInput = useMutation({
    mutationFn: async (file: File) => {
      const data = await jobsService.uploadInput(file);
      return { file_id: data.file_id, preview: URL.createObjectURL(file) };
    },
    onSuccess: (v) => { onChange(v); toast("Đã upload ảnh tham chiếu", "success"); },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message ?? e?.message ?? "Upload ảnh lỗi";
      toast(msg, "error");
    },
  });

  if (!allowed) {
    return (
      <p className="text-xs text-slate-500 italic">
        <Lock size={12} className="inline" /> Gói hiện tại không hỗ trợ upload ảnh tham chiếu cho {jobType}.
      </p>
    );
  }

  return (
    <div>
      <label className="text-sm font-medium">
        Ảnh tham chiếu (optional) — quyết định mode:
      </label>
      <p className="text-xs text-slate-600 mt-1">
        {jobType === "image" ? (
          <>
            • Không upload → <strong>prompt → image</strong> (text-to-image)<br />
            • Có upload → <strong>image + prompt → image</strong> (Grok dùng ảnh làm style/composition reference, generate ảnh mới)
          </>
        ) : (
          <>
            • Không upload → <strong>prompt → video</strong> (text-to-video)<br />
            • Có upload → <strong>image → video</strong> (Grok animate ảnh upload theo prompt)
          </>
        )}
      </p>
      <div className="flex items-center gap-3 mt-1">
        {value ? (
          <div className="relative">
            <img src={value.preview} className="w-24 h-24 object-cover rounded border" />
            <button type="button" onClick={() => onChange(null)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-24 h-24 border-2 border-dashed border-slate-200 rounded flex flex-col items-center justify-center text-slate-9000 hover:border-brand-500 hover:text-blue-600">
            <ImageIcon size={24} />
            <span className="text-xs mt-1">{uploadInput.isPending ? "..." : "Upload"}</span>
          </button>
        )}
        <input
          type="file" accept="image/*" ref={fileRef} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInput.mutate(f); }}
        />
      </div>
    </div>
  );
}
