import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { toolsService } from "../services/tools.service";


/** Minimal create-tool modal. Captures the essentials (code + name) and
 *  defers logo / description / assets to the edit + upload flows so this
 *  step stays a one-step gate to seeing the new card. */
export function CreateToolModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");

  const create = useMutation({
    mutationFn: () => toolsService.create({
      code: code.trim().toLowerCase(),
      name: name.trim(),
      description: description.trim() || null,
      homepage_url: homepageUrl.trim() || null,
    }),
    onSuccess: () => {
      toast("Đã tạo tool", "success");
      onCreated();
      onClose();
    },
    onError: (e: { response?: { data?: { detail?: { message?: string } } } }) =>
      toast(e?.response?.data?.detail?.message ?? "Lỗi tạo tool", "error"),
  });

  const canSubmit = code.trim().length > 0 && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Tạo Tool mới</h2>

        <div>
          <label className="text-sm font-medium text-slate-700">Code (slug)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="cvp"
            className="input mt-1 font-mono"
            pattern="^[a-z0-9][a-z0-9_-]*$"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Định danh — chữ thường + số + <code>_</code>/<code>-</code>. Không đổi sau khi tạo.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Tên hiển thị</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Create Video Pro"
            className="input mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Mô tả (tuỳ chọn)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Tool batch AI video/image generation chạy desktop..."
            className="input mt-1 resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Homepage URL (tuỳ chọn)</label>
          <input
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="https://nexoratech.com.vn/create-video-pro"
            className="input mt-1"
            type="url"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Huỷ</button>
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            className="btn-primary"
          >
            {create.isPending ? "Đang tạo..." : "Tạo"}
          </button>
        </div>
      </div>
    </div>
  );
}
