import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Image as ImageIcon } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { api } from "@/core/api/axios";

import { toolsService } from "../services/tools.service";
import type { Tool } from "../models/tool";


/** Edit modal — change label / description / homepage, replace logo.
 *  Code (slug) is immutable post-create so we don't expose it here.
 *
 *  Logo upload is a separate endpoint that returns the whole Tool row,
 *  so we sync local preview state from the response instead of fetching
 *  back via the list query. */
export function EditToolModal({
  tool, onClose, onSaved,
}: { tool: Tool; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description ?? "");
  const [homepageUrl, setHomepageUrl] = useState(tool.homepage_url ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(tool.logo_url);
  // Local preview blob URL when admin picks a new logo before upload completes.
  const [logoBlobPreview, setLogoBlobPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lazy-fetch the current logo through axios so the JWT header travels.
  // Run once on mount via useState init pattern.
  useState(() => {
    if (logoUrl) {
      (async () => {
        try {
          const r = await api.get(logoUrl, { responseType: "blob" });
          setLogoBlobPreview(URL.createObjectURL(r.data));
        } catch { /* keep fallback icon */ }
      })();
    }
    return null;
  });

  const save = useMutation({
    mutationFn: () => toolsService.update(tool.id, {
      name: name.trim(),
      description: description.trim() || null,
      homepage_url: homepageUrl.trim() || null,
    }),
    onSuccess: () => {
      toast("Đã lưu", "success");
      onSaved();
      onClose();
    },
    onError: () => toast("Lỗi lưu", "error"),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => toolsService.uploadLogo(tool.id, file),
    onSuccess: (updated) => {
      toast("Đã đổi logo", "success");
      setLogoUrl(updated.logo_url);
      onSaved();
    },
    onError: () => toast("Upload logo thất bại", "error"),
  });

  const handleLogoPick = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast("Chỉ chấp nhận file ảnh", "error");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast("Logo tối đa 5MB", "error");
      return;
    }
    // Show local preview immediately.
    if (logoBlobPreview) URL.revokeObjectURL(logoBlobPreview);
    setLogoBlobPreview(URL.createObjectURL(f));
    uploadLogo.mutate(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Sửa Tool</h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{tool.code}</p>
        </div>

        {/* Logo upload */}
        <div>
          <label className="text-sm font-medium text-slate-700">Logo</label>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 ring-1 ring-slate-300/50 grid place-items-center overflow-hidden">
              {logoBlobPreview ? (
                <img src={logoBlobPreview} alt={tool.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={24} className="text-slate-400" />
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoPick(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLogo.isPending}
                className="btn-ghost inline-flex items-center gap-1.5 text-sm"
              >
                <Upload size={14} />
                {uploadLogo.isPending ? "Đang upload..." : (logoUrl ? "Đổi logo" : "Upload logo")}
              </button>
              <p className="text-[10px] text-slate-500 mt-1">PNG/JPG/WebP, max 5MB</p>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Tên hiển thị (label)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Mô tả</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input mt-1 resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Homepage URL</label>
          <input
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            className="input mt-1"
            type="url"
            placeholder="https://..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Huỷ</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            className="btn-primary"
          >
            {save.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
