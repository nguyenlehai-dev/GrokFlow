import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User as UserIcon, Lock, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { api } from "@/core/api/axios";

/** Self-service account settings. User updates own profile + changes
 *  password. Super_admin có cùng quyền nhưng qua Admin → Users với
 *  ngữ cảnh khác. Layout 2 card: Profile / Password — đơn giản, không
 *  mở rộng sang notifications/2FA cho v1. */
export function AccountPage() {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();

  const [fullName, setFullName] = useState(me?.full_name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [locale, setLocale] = useState(me?.locale ?? "vi");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const r = await api.patch("/api/auth/me", {
        full_name: fullName,
        email: email !== me?.email ? email : undefined,
        locale,
      });
      return r.data;
    },
    onSuccess: (fresh) => {
      setUser(fresh);
      qc.invalidateQueries({ queryKey: ["me"] });
      toast("Cập nhật thông tin thành công", "success");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message
        ?? e?.response?.data?.detail
        ?? "Lưu profile lỗi";
      toast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api.post("/api/auth/me/password", {
        current_password: currentPw,
        new_password: newPw,
      }),
    onSuccess: () => {
      setCurrentPw(""); setNewPw(""); setNewPw2("");
      toast("Đổi mật khẩu thành công — lần đăng nhập tới dùng mật khẩu mới", "success");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message
        ?? e?.response?.data?.detail
        ?? "Đổi mật khẩu lỗi";
      toast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    },
  });

  const passwordError =
    newPw && newPw.length < 8 ? "≥ 8 ký tự"
    : newPw && newPw2 && newPw !== newPw2 ? "Mật khẩu mới không khớp"
    : "";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Tài khoản của tôi</h1>

      {/* Profile card */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <UserIcon size={18} className="text-blue-600" />
          <h2 className="font-semibold text-slate-700">Thông tin cá nhân</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Họ tên</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Email</label>
            <input
              className="input" type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Đổi email = đổi ID đăng nhập</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Ngôn ngữ</label>
            <select
              className="input"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Role</label>
            <input className="input bg-slate-50 cursor-not-allowed" value={me?.role ?? ""} readOnly />
            <p className="text-xs text-slate-400 mt-1">Liên hệ super_admin nếu cần đổi</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Save size={16} />
          {updateProfile.isPending ? "Đang lưu..." : "Lưu thông tin"}
        </button>
      </section>

      {/* Password card */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Lock size={18} className="text-rose-600" />
          <h2 className="font-semibold text-slate-700">Đổi mật khẩu</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Mật khẩu hiện tại</label>
            <div className="relative">
              <input
                className="input pr-9"
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Mật khẩu mới</label>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={8}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Nhập lại mật khẩu mới</label>
            <input
              className="input"
              type={showPw ? "text" : "password"}
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
          </div>
        </div>
        {passwordError && <p className="text-xs text-rose-600">{passwordError}</p>}
        <button
          type="button"
          onClick={() => changePassword.mutate()}
          disabled={
            changePassword.isPending
            || !currentPw || !newPw || newPw !== newPw2 || newPw.length < 8
          }
          className="btn-primary bg-rose-600 hover:bg-rose-700 inline-flex items-center gap-1.5"
        >
          <Lock size={16} />
          {changePassword.isPending ? "Đang đổi..." : "Đổi mật khẩu"}
        </button>
      </section>

      <p className="text-xs text-slate-400 text-center">
        Mọi thay đổi đều được log; super_admin có thể audit và reset password khi cần.
      </p>
    </div>
  );
}

export default AccountPage;
