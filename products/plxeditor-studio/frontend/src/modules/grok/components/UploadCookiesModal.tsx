import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";
import { profilesService } from "../services/profiles.service";

export function UploadCookiesModal({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await profilesService.uploadCookies(profileId, file);
      toast("Đã import cookies, profile chuyển sang logged_in", "success");
      qc.invalidateQueries({ queryKey: ["profiles"] });
      onClose();
    } catch (e) {
      // axios interceptor đã hiện toast lỗi
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg space-y-4">
        <h2 className="text-lg font-semibold">Upload cookies cho profile</h2>
        <div className="text-sm text-slate-600 space-y-2">
          <p>1. Cài extension <a className="text-brand-600 underline" target="_blank" rel="noreferrer" href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm">Cookie-Editor</a> trên Chrome.</p>
          <p>2. Đăng nhập tài khoản provider trong Chrome đó.</p>
          <p>3. Mở Cookie-Editor → bấm <code>Export → Export as JSON</code>.</p>
          <p>4. Lưu file <code>.json</code> rồi upload tại đây.</p>
          <p className="text-amber-600">Cookies sẽ được mã hóa Fernet trên server. Không bao giờ được trả về frontend.</p>
        </div>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!file || busy} onClick={upload}>
            {busy ? "Đang upload..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
