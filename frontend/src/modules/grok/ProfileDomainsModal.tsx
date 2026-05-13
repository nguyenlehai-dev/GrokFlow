import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

interface Domain {
  id: string;
  hostname: string;
  status: string;
}

interface ProfileDomainsResponse {
  profile_id: string;
  domain_ids: string[];
}

/** Super-admin-only modal: pick which tenant domains can see + auto-pick
 *  this profile. Empty selection → profile invisible to all tenants except
 *  users in the profile owner's own domain (legacy direct-ownership rule).
 */
export function ProfileDomainsModal({
  profileId,
  profileName,
  onClose,
}: {
  profileId: string;
  profileName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: allDomains, isLoading: loadingDomains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<Domain[]>("/api/admin/domains")).data,
  });

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ["profile-domains", profileId],
    queryFn: async () =>
      (await api.get<ProfileDomainsResponse>(`/api/profiles/${profileId}/domains`)).data,
  });

  const save = useMutation({
    mutationFn: (domain_ids: string[]) =>
      api.put<ProfileDomainsResponse>(`/api/profiles/${profileId}/domains`, { domain_ids }),
    onSuccess: () => {
      toast("Đã lưu phân quyền domain", "success");
      qc.invalidateQueries({ queryKey: ["profile-domains", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      onClose();
    },
    onError: () => toast("Lưu thất bại", "error"),
  });

  const loading = loadingDomains || loadingCurrent;
  const selectedSet = new Set(current?.domain_ids ?? []);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) selectedSet.delete(id);
    else selectedSet.add(id);
    // No state needed — we read back from a fresh `selectedSet` snapshot
    // on submit. For visual feedback re-render via invalidating a tiny
    // local state, but the simplest approach is to use a controlled list:
    // since each row uses a `defaultChecked` and we collect from DOM on
    // submit, we don't need React state. Re-read below.
  };

  const handleSave = () => {
    const inputs = document.querySelectorAll<HTMLInputElement>(
      "input[data-domain-checkbox]"
    );
    const ids: string[] = [];
    inputs.forEach((el) => {
      if (el.checked) ids.push(el.value);
    });
    save.mutate(ids);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Phân quyền domain cho profile
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              <code>{profileName}</code> — tick các domain được phép dùng profile này
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Đang tải…</p>
        ) : (
          <>
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Để trống = profile chỉ hiển thị cho user cùng domain với owner
              (legacy). Tick 1 domain = customer trong domain đó sẽ thấy +
              auto-pick được profile này.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
              {(allDomains ?? []).length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">
                  Chưa có domain nào — tạo trước ở Admin → Domains.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {allDomains?.map((d) => (
                    <li key={d.id} className="px-3 py-2">
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          value={d.id}
                          data-domain-checkbox
                          defaultChecked={selectedSet.has(d.id)}
                          onChange={() => toggle(d.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                        />
                        <span className="flex-1 font-medium text-slate-700">
                          {d.hostname}
                        </span>
                        <span className="text-xs text-slate-400">{d.status}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <footer className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={loading || save.isPending}
            onClick={handleSave}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {save.isPending ? "Đang lưu…" : "Lưu"}
          </button>
        </footer>
      </div>
    </div>
  );
}
