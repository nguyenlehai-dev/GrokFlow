import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UploadCookiesModal } from "./UploadCookiesModal";
import { AutoLoginModal } from "./AutoLoginModal";
import { ProjectsModal } from "./ProjectsModal";

interface Profile {
  id: string;
  name: string;
  provider: string;
  status: string;
  last_login_check_at: string | null;
  last_used_at: string | null;
  active_jobs: number;
  max_concurrent_jobs: number;
  active_video_jobs: number;
  max_concurrent_video: number;
  created_at: string;
}

export function ProfilesPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = (me?.role === "admin" || me?.role === "super_admin");
  const isSuper = me?.role === "super_admin";
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await api.get<Profile[]>("/api/profiles")).data,
    refetchInterval: 4000,  // poll so slot count updates live
  });
  const [open, setOpen] = useState(false);
  const [cookiesFor, setCookiesFor] = useState<string | null>(null);
  const [autoLoginFor, setAutoLoginFor] = useState<string | null>(null);
  // Per-row state for the domain assignment modal — super_admin only.
  const [projectsFor, setProjectsFor] = useState<{ id: string; name: string } | null>(null);

  const disable = useMutation({
    mutationFn: (id: string) => api.post(`/api/profiles/${id}/disable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const stopVnc = useMutation({
    mutationFn: (id: string) => api.post(`/api/profiles/${id}/stop-vnc`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const updateMax = useMutation({
    mutationFn: ({ id, max }: { id: string; max: number }) =>
      api.patch(`/api/profiles/${id}`, { max_concurrent_jobs: max }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const updateMaxVideo = useMutation({
    mutationFn: ({ id, max }: { id: string; max: number }) =>
      api.patch(`/api/profiles/${id}`, { max_concurrent_video: max }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isAdmin ? <>Profile <span className="text-gradient">pool</span></> : "Available profiles"}
          </h1>
          <p className="page-subtitle">
            {isAdmin
              ? "Image slots: chạy qua REST API, scale thoải mái (12-16 OK). Video slots: chạy qua Playwright DOM, KHÔNG để quá 4-6 mỗi profile — Chromium sẽ crash."
              : "Pool admin đã đăng nhập sẵn. Chọn profile lúc tạo job, hoặc để hệ thống tự pick (least-loaded)."}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setOpen(true)} className="btn-primary">+ Tạo profile</button>
        )}
      </div>

      {isAdmin && (
        <div className="alert-warning">
          <span className="text-xl leading-none">⚠️</span>
          <div className="flex-1 space-y-2">
            <p className="font-semibold text-amber-900">Giới hạn video theo từng tài khoản Grok</p>
            <p>
              Mỗi tài khoản Grok có quota video riêng (thường ~5-10 video/ngày tuỳ gói). Khi 1 profile
              hết quota, job video chạy trên profile đó sẽ báo lỗi <code className="px-1 bg-amber-100 rounded text-xs">invalid-parent-post</code> hoặc{" "}
              <code className="px-1 bg-amber-100 rounded text-xs">rate_limited</code>.
            </p>
            <p><strong>Cách xử lý:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Tạm thời:</strong> bấm <em>Disable</em> profile đang hết quota → hệ thống auto-pick profile khác cho job tiếp theo.
              </li>
              <li>
                <strong>Lâu dài:</strong> tạo thêm profile (mỗi profile = 1 tài khoản Grok riêng) để pool có nhiều quota gộp lại. Khi 1 cái hết, các cái khác gánh.
              </li>
              <li>
                <strong>Theo dõi:</strong> profile vừa fail video sẽ thấy job status <code className="px-1 bg-amber-100 rounded text-xs">rate_limited</code> trong{" "}
                <a href="/jobs" className="underline text-amber-700 font-medium">Jobs</a> — đó là tín hiệu chuyển profile.
              </li>
            </ul>
            <p className="text-xs text-amber-700 mt-2">
              Lưu ý: image jobs dùng quota khác (riêng), nên 1 profile có thể vẫn chạy image bình thường dù đã hết quota video.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-ink-400">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-900 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" title="Image jobs cap (API path, scales well)">Image slots</th>
                <th className="px-4 py-2" title="Video jobs cap (Playwright path, capped at ~4 per Chromium)">Video slots</th>
                <th className="px-4 py-2">Last used</th>
                {isAdmin && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.map((p) => {
                const usage = p.max_concurrent_jobs > 0 ? p.active_jobs / p.max_concurrent_jobs : 0;
                const slotColor = usage >= 1 ? "text-rose-600" : usage >= 0.7 ? "text-amber-600" : "text-emerald-600";
                const videoUsage = p.max_concurrent_video > 0
                  ? (p.active_video_jobs ?? 0) / p.max_concurrent_video
                  : 0;
                const videoColor = videoUsage >= 1
                  ? "text-rose-600"
                  : videoUsage >= 0.7
                  ? "text-amber-600"
                  : "text-emerald-600";
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.provider}</td>
                    <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2">
                      <span className={`font-mono font-semibold ${slotColor}`}>
                        {p.active_jobs}/{p.max_concurrent_jobs}
                      </span>
                      {isAdmin && (
                        <input
                          type="number"
                          min={1}
                          max={16}
                          defaultValue={p.max_concurrent_jobs}
                          className="ml-2 w-14 px-2 py-0.5 text-xs border rounded"
                          title="Sửa max (image)"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v >= 1 && v <= 16 && v !== p.max_concurrent_jobs) {
                              updateMax.mutate({ id: p.id, max: v });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-mono font-semibold ${videoColor}`}>
                        {p.active_video_jobs ?? 0}/{p.max_concurrent_video ?? 4}
                      </span>
                      {isAdmin && (
                        <input
                          type="number"
                          min={1}
                          max={12}
                          defaultValue={p.max_concurrent_video ?? 4}
                          className="ml-2 w-14 px-2 py-0.5 text-xs border rounded"
                          title="Video chạy qua Playwright — đừng đặt quá 4-6 mỗi profile để tránh crash Chromium"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v >= 1 && v <= 12 && v !== p.max_concurrent_video) {
                              updateMaxVideo.mutate({ id: p.id, max: v });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-400 text-xs">
                      {p.last_used_at ? new Date(p.last_used_at).toLocaleString() : "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button className="btn-primary" onClick={() => setAutoLoginFor(p.id)}>Auto login</button>
                        {isSuper && (
                          <button
                            className="btn-ghost"
                            onClick={() => setProjectsFor({ id: p.id, name: p.name })}
                            title="Quản lý projects + phân quyền domain per-project"
                          >
                            Projects
                          </button>
                        )}
                        <button className="btn-ghost" onClick={() => stopVnc.mutate(p.id)} title="Tắt browser, giải phóng RAM">Stop</button>
                        <button className="btn-ghost" onClick={() => disable.mutate(p.id)}>Disable</button>
                        <button className="btn-ghost text-rose-600" onClick={() => remove.mutate(p.id)}>Delete</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-ink-400">
                    {isAdmin ? "Chưa có profile nào. Bấm 'Tạo profile' để bắt đầu." : "Pool đang trống — admin chưa setup profile nào."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateProfileModal onClose={() => setOpen(false)} />}
      {cookiesFor && <UploadCookiesModal profileId={cookiesFor} onClose={() => setCookiesFor(null)} />}
      {autoLoginFor && <AutoLoginModal profileId={autoLoginFor} onClose={() => setAutoLoginFor(null)} />}
      {projectsFor && (
        <ProjectsModal
          profileId={projectsFor.id}
          profileName={projectsFor.name}
          onClose={() => setProjectsFor(null)}
        />
      )}
    </div>
  );
}

interface CreateValues {
  name: string;
  provider: "grok" | "flow";
  max_concurrent_jobs: number;
}

function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { provider: "grok", max_concurrent_jobs: 4 },
  });
  const onSubmit = async (v: CreateValues) => {
    await api.post("/api/profiles", { ...v, max_concurrent_jobs: Number(v.max_concurrent_jobs) });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm rounded-lg bg-ink-900 p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">Tạo Chrome Profile (admin)</h2>
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Provider</label>
          <select className="input" {...register("provider")}>
            <option value="grok">Grok</option>
            <option value="flow">Flow</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Max parallel jobs (tabs)</label>
          <input
            type="number"
            min={1}
            max={16}
            className="input"
            {...register("max_concurrent_jobs", { required: true, min: 1, max: 16 })}
          />
          <p className="text-xs text-ink-400 mt-1">
            Mỗi tab ≈ 150 MB RAM. Khuyến nghị 4-8 cho account có quyền video; account thường 1-2.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>Tạo</button>
        </div>
      </form>
    </div>
  );
}
