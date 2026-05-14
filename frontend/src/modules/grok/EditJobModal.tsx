import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

interface Job {
  id: string;
  prompt: string;
  status: string;
}

export function EditJobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(job.prompt);

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/api/jobs/${job.id}`, { prompt })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast("Đã cập nhật prompt.", "success");
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sửa prompt — {job.id.slice(0, 8)}</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-slate-500">
          Chỉ sửa được khi job đang <strong>{job.status}</strong>. Khi worker pick lên thì prompt mới sẽ được dùng.
        </p>
        <textarea
          className="input min-h-[120px] w-full"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={4000}
        />
        <div className="text-xs text-slate-400 text-right">{prompt.length}/4000</div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <button className="btn-ghost" onClick={onClose}>Hủy</button>
          <button
            className="btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || prompt.trim() === "" || prompt === job.prompt}
          >
            {save.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
