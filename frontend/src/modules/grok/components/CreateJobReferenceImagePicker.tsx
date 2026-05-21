import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Image as ImageIcon, Lock, X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { jobsService } from "../services/jobs.service";

export interface InputImage {
  file_id: string;
  preview: string;
}

const MAX_REFS = 4;

/** Multi-reference picker — up to MAX_REFS image uploads.
 *
 *  Why multi-ref: Grok Imagine accepts several chat attachments and the
 *  prompt can address them as @IMAGE_1 / @IMAGE_2 / … for distinct
 *  roles (face source, outfit source, background, etc.). Old single-slot
 *  picker forced operators to collage two refs into one image or live
 *  with Grok defaulting to "reproduce ref #1" when the prompt mentioned
 *  a #2 that wasn't uploaded.
 *
 *  Wire-up: parent owns the list, picker emits onChange(list). Submit
 *  sends `reference_images: [file_id_1, file_id_2, …]`. The
 *  legacy single-field path (`input_image_file_id`) is kept on the
 *  backend so older clients keep working.
 */
export function CreateJobReferenceImagePicker({
  jobType, allowed, value, onChange, onPendingChange,
}: {
  jobType: "image" | "video";
  allowed: boolean;
  value: InputImage[];
  onChange: (v: InputImage[]) => void;
  /** Lifts the upload-in-flight state to the parent modal so its
   *  Submit button can disable itself while an upload is mid-flight.
   *  Without this the operator can race past upload and end up with
   *  a job that has no reference_image — Grok then replies "send me
   *  the image" because nothing was attached. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadInput = useMutation({
    mutationFn: async (file: File) => {
      const data = await jobsService.uploadInput(file);
      return { file_id: data.file_id, preview: URL.createObjectURL(file) };
    },
    onSuccess: (v) => {
      onChange([...value, v]);
      toast(`Đã upload ảnh tham chiếu #${value.length + 1}`, "success");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message ?? e?.message ?? "Upload ảnh lỗi";
      toast(msg, "error");
    },
  });

  // Mirror the mutation state up to the parent so the modal's submit
  // button knows when an upload is still in-flight. useEffect avoids
  // the "render-time setState in parent" warning.
  useEffect(() => {
    onPendingChange?.(uploadInput.isPending);
  }, [uploadInput.isPending, onPendingChange]);

  if (!allowed) {
    return (
      <p className="text-xs text-slate-500 italic">
        <Lock size={12} className="inline" /> Gói hiện tại không hỗ trợ upload ảnh tham chiếu cho {jobType}.
      </p>
    );
  }

  const remaining = MAX_REFS - value.length;
  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      <label className="text-sm font-medium">
        Ảnh tham chiếu (optional, tối đa {MAX_REFS}) — quyết định mode:
      </label>
      <p className="text-xs text-slate-600 mt-1">
        {jobType === "image" ? (
          <>
            • Không upload → <strong>prompt → image</strong> (text-to-image)<br />
            • 1 ảnh → <strong>image + prompt → image</strong> (Grok dùng làm style/composition reference)<br />
            • Nhiều ảnh → trong prompt dùng <code>@IMAGE_1</code>, <code>@IMAGE_2</code>… để gán role cho từng ảnh (vd: face từ #1, outfit từ #2)
          </>
        ) : (
          <>
            • Không upload → <strong>prompt → video</strong> (text-to-video)<br />
            • 1 ảnh → <strong>image → video</strong> (Grok animate ảnh upload theo prompt)<br />
            • Nhiều ảnh → reference cho từng frame/role tùy prompt
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {value.map((img, idx) => (
          <div key={idx} className="relative">
            <img src={img.preview} alt={`ref ${idx + 1}`} className="w-24 h-24 object-cover rounded border" />
            <span className="absolute bottom-0 left-0 bg-slate-900/70 text-white text-[10px] px-1 rounded-tr">
              #{idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5"
              aria-label={`Xóa ảnh #${idx + 1}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadInput.isPending}
            className="w-24 h-24 border-2 border-dashed border-slate-200 rounded flex flex-col items-center justify-center text-slate-500 hover:border-brand-500 hover:text-blue-600 disabled:opacity-50"
          >
            <ImageIcon size={24} />
            <span className="text-xs mt-1">
              {uploadInput.isPending ? "..." : `+ #${value.length + 1}`}
            </span>
          </button>
        )}
        <input
          type="file" accept="image/*" ref={fileRef} className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadInput.mutate(f);
            // Reset so the same file can be re-selected if removed then
            // re-added (browsers gate same-file change events otherwise).
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
