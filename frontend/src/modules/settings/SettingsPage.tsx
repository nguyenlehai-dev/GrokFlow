import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";

interface WebhookOut {
  webhook_url: string | null;
  has_secret: boolean;
  new_secret?: string | null;
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="card space-y-2">
        <h2 className="font-semibold">Tài khoản</h2>
        <p className="text-sm text-slate-600">Email: <span className="font-medium">{user?.email}</span></p>
        <p className="text-sm text-slate-600">Role: <span className="font-medium">{user?.role}</span></p>
        <p className="text-sm text-slate-600">Status: <span className="font-medium">{user?.status}</span></p>
      </section>

      <PasswordSection />
      <WebhookSection />
    </div>
  );
}

function PasswordSection() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ current_password: string; new_password: string }>();
  const onSubmit = async (v: { current_password: string; new_password: string }) => {
    await api.post("/api/settings/password", v);
    toast("Đổi password thành công", "success");
    reset();
  };
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Đổi mật khẩu</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <div>
          <label className="text-sm font-medium">Mật khẩu hiện tại</label>
          <input type="password" className="input" {...register("current_password", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Mật khẩu mới (≥8 ký tự)</label>
          <input type="password" className="input" {...register("new_password", { required: true, minLength: 8 })} />
        </div>
        <button className="btn-primary" disabled={isSubmitting}>Đổi password</button>
      </form>
    </section>
  );
}

function WebhookSection() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["webhook"],
    queryFn: async () => (await api.get<WebhookOut>("/api/settings/webhook")).data,
  });
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ webhook_url: string; rotate_secret: boolean }>({
    values: { webhook_url: data?.webhook_url ?? "", rotate_secret: false },
  });
  const [revealed, setRevealed] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (payload: { webhook_url: string; rotate_secret: boolean }) =>
      (await api.put<WebhookOut>("/api/settings/webhook", {
        webhook_url: payload.webhook_url || null,
        rotate_secret: payload.rotate_secret,
      })).data,
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ["webhook"] });
      if (out.new_secret) {
        setRevealed(out.new_secret);
        toast("Đã rotate webhook secret. Copy ngay!", "success");
      } else {
        toast("Webhook đã cập nhật", "success");
      }
    },
  });

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Webhook (job complete)</h2>
      <p className="text-sm text-slate-600">
        Server sẽ POST event <code>job.success</code> / <code>job.failed</code> / <code>job.cancelled</code> tới URL này.
        Header <code>X-Grokflow-Signature</code> = HMAC-SHA256(secret, body) base64.
      </p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-2">
        <div>
          <label className="text-sm font-medium">Webhook URL</label>
          <input type="url" placeholder="https://your-app.com/webhooks/grokflow" className="input"
            {...register("webhook_url")} />
        </div>
        <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" {...register("rotate_secret")} /> Rotate secret
        </label>
        <p className="text-xs text-slate-500">
          Trạng thái secret: {data?.has_secret ? "đã có" : "chưa có"}
          {data?.has_secret ? " — không thể xem lại, chỉ rotate." : ""}
        </p>
        <button className="btn-primary" disabled={isSubmitting}>Lưu</button>
      </form>

      {revealed && (
        <div className="border-2 border-emerald-500 rounded p-3 space-y-2">
          <div className="font-medium text-emerald-700 text-sm">Webhook secret mới — copy ngay, không thể xem lại:</div>
          <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs whitespace-pre-wrap break-all">{revealed}</pre>
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(revealed)}>Copy</button>
          <button className="btn-ghost ml-2" onClick={() => setRevealed(null)}>Tôi đã lưu</button>
        </div>
      )}
    </section>
  );
}
