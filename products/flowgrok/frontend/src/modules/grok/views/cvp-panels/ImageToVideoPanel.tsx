import { useState } from "react";
import {
  ImagePlus, Eraser, Play, Square, RotateCcw, FolderOpen, Trash2,
  ImageIcon, X, Loader2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import {
  LogEntry, ToolButton, StatusPill, VideoSettingsRow,
  BatchPanel, FolderPicker, ProgressFooter, LogPanel, PanelHeader,
  DropZone, nowTs,
} from "./shared";
import {
  useGrokJobs, useUploadInput, useBatchSubmit, useLocalState,
  checkQuotaBeforeBatch, mapStatus, type JobRow,
} from "./hooks";
import { PreviewModal } from "./PreviewModal";

interface ImageDraft {
  draftId: number;
  file: File;
  preview: string;
  prompt: string;
  /** Once /upload-input returns, store the file_id so submit can include it. */
  fileId: string | null;
  uploading: boolean;
}

/** Image → Video — drop reference images, write motion prompt per image,
 *  upload to /api/jobs/upload-input, then submit a job per (image, prompt). */
export function ImageToVideoPanel() {
  const { jobs, isLoading, submit, cancel, retry, remove, submitting } = useGrokJobs({ jobType: "video" });
  const upload = useUploadInput();

  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [draftSeq, setDraftSeq] = useState(1);
  const [selectedDrafts, setSelectedDrafts] = useState<Set<number>>(new Set());

  const [ratio, setRatio]               = useLocalState("cvp.i2v.ratio", "3:2");
  const [duration, setDuration]         = useLocalState("cvp.i2v.duration", "6");
  const [resolution, setResolution]     = useLocalState("cvp.i2v.resolution", "720p");
  const [count, setCount]               = useLocalState("cvp.i2v.count", "1");
  const [batchEnabled, setBatchEnabled] = useLocalState("cvp.i2v.batchEnabled", true);
  const [batchSize, setBatchSize]       = useLocalState("cvp.i2v.batchSize", "3");
  const [batchDelay, setBatchDelay]     = useLocalState("cvp.i2v.batchDelay", "8");
  const [hideFailed, setHideFailed]     = useLocalState("cvp.i2v.hideFailed", false);
  const [folder, setFolder]             = useLocalState("cvp.i2v.folder", "D:\\KamitoJes_QT\\Tool_AI\\Output\\Image_To_Video");
  const [log, setLog] = useState<LogEntry[]>([]);
  const batch = useBatchSubmit<ImageDraft>();
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const startSeq = draftSeq;
    const newDrafts: ImageDraft[] = files.map((f, i) => ({
      draftId: startSeq + i,
      file: f,
      preview: URL.createObjectURL(f),
      prompt: "",
      fileId: null,
      uploading: true,
    }));
    setDrafts((prev) => [...prev, ...newDrafts]);
    setSelectedDrafts((prev) => { const s = new Set(prev); newDrafts.forEach((d) => s.add(d.draftId)); return s; });
    setDraftSeq((n) => n + files.length);
    setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `Đang upload ${files.length} ảnh...` }]);

    // Upload each in parallel; mark fileId when each finishes so submit
    // can pick it up without waiting for everything.
    for (const d of newDrafts) {
      try {
        const res = await upload.mutateAsync(d.file);
        setDrafts((prev) => prev.map((x) =>
          x.draftId === d.draftId ? { ...x, fileId: res.file_id, uploading: false } : x,
        ));
        setLog((p) => [...p, { ts: nowTs(), level: "success", msg: `✓ Upload OK: ${d.file.name} → ${res.file_id.slice(0, 8)}` }]);
      } catch (e: any) {
        const msg = e?.response?.data?.detail?.message ?? "Upload thất bại";
        setDrafts((prev) => prev.map((x) =>
          x.draftId === d.draftId ? { ...x, uploading: false } : x,
        ));
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ Upload lỗi ${d.file.name}: ${msg}` }]);
      }
    }
  };

  const removeDraft = (id: number) => {
    setDrafts((prev) => prev.filter((d) => d.draftId !== id));
    setSelectedDrafts((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };
  const toggleDraft = (id: number) =>
    setSelectedDrafts((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const updatePrompt = (id: number, text: string) =>
    setDrafts((prev) => prev.map((d) => d.draftId === id ? { ...d, prompt: text } : d));

  const startBatch = async () => {
    const rawQueue = drafts.filter((d) =>
      selectedDrafts.has(d.draftId) && d.prompt.trim() && d.fileId && !d.uploading,
    );
    if (rawQueue.length === 0) { toast("Cần ít nhất 1 ảnh đã upload + có prompt", "error"); return; }
    const queue = await checkQuotaBeforeBatch(rawQueue, toast);
    if (queue === null || queue.length === 0) return;
    setLog((p) => [...p, { ts: nowTs(), level: "info",
      msg: `▶ Submit ${queue.length} job${batchEnabled ? ` · batch ${batchSize} · delay ${batchDelay}s` : ""}` }]);

    await batch.run({
      items: queue,
      batchEnabled,
      batchSize: Number(batchSize) || 1,
      delaySec: Number(batchDelay) || 0,
      submit: (d) => submit.mutateAsync({
        prompt: d.prompt,
        input_image_file_id: d.fileId!,
        options: { aspect_ratio: ratio, duration: Number(duration), resolution },
      }),
      onItemSuccess: (d) => removeDraft(d.draftId),
      onItemError: (d, e) => {
        const msg = (e as any)?.response?.data?.detail?.message ?? "Submit lỗi";
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ ${d.file.name}: ${msg}` }]);
      },
      onBatchDone: (idx, total, ok, fail) => {
        setLog((p) => [...p, { ts: nowTs(), level: fail > 0 ? "warn" : "success",
          msg: `Batch ${idx}/${total}: ${ok} ok · ${fail} fail` }]);
      },
    });
  };

  const stopAll = async () => {
    batch.stop();
    const active = jobs.filter((j) => !["success", "failed", "cancelled"].includes(j.status));
    if (active.length === 0 && !batch.running) { toast("Không có gì đang chạy", "info"); return; }
    if (batch.running) setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Dừng batch loop...` }]);
    for (const j of active) { try { await cancel.mutateAsync(j.id); } catch { /* */ } }
    if (active.length > 0) setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Cancel ${active.length} job` }]);
  };
  const retryFailed = async () => {
    const failed = jobs.filter((j) => j.status === "failed");
    if (failed.length === 0) { toast("Không có job thất bại", "info"); return; }
    for (const j of failed) { try { await retry.mutateAsync(j.id); } catch { /* */ } }
    setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `↻ Retry ${failed.length} job` }]);
  };

  const successCount = jobs.filter((j) => j.status === "success").length;
  const failedCount  = jobs.filter((j) => j.status === "failed").length;
  const visibleJobs = hideFailed
    ? jobs.filter((j) => j.status !== "failed" && j.status !== "cancelled")
    : jobs;

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Image → Video"
        subtitle={`Animate ảnh tĩnh thành video — ${jobs.length} job lịch sử · ${successCount} thành công · ${failedCount} lỗi`}
        accent="cyan"
      />

      <DropZone onFiles={addFiles} label="Kéo thả ảnh (hoặc bấm) — upload tự động, soạn prompt sau" />

      <div className="cvp-card p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton icon={ImagePlus}>Import từ folder</ToolButton>
          <ToolButton icon={Eraser} onClick={() => { setDrafts([]); setSelectedDrafts(new Set()); }}>Clear Drafts</ToolButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={Play} variant="primary" onClick={startBatch}
                      disabled={submitting || selectedDrafts.size === 0}>
            Bắt Đầu ({selectedDrafts.size})
          </ToolButton>
          <ToolButton icon={Square} variant="danger" onClick={stopAll}>Dừng</ToolButton>
          <ToolButton icon={RotateCcw} onClick={retryFailed}>Retry Lỗi</ToolButton>
          <div className="flex-1" />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input type="checkbox" className="accent-cyan-500"
                   checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} />
            Ẩn video lỗi
          </label>
        </div>
      </div>

      <VideoSettingsRow ratio={ratio} setRatio={setRatio} duration={duration} setDuration={setDuration}
                        resolution={resolution} setResolution={setResolution} count={count} setCount={setCount} />
      <BatchPanel enabled={batchEnabled} setEnabled={setBatchEnabled}
                  size={batchSize} setSize={setBatchSize} delay={batchDelay} setDelay={setBatchDelay}
                  waitState={batch.waitState} />
      <FolderPicker folder={folder} onChange={setFolder} />

      {/* Drafts (uploaded but not yet submitted) */}
      {drafts.length > 0 && (
        <div className="cvp-card overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">
              Drafts đang upload / soạn prompt ({drafts.length})
            </div>
            <button onClick={() => setSelectedDrafts(selectedDrafts.size === drafts.length ? new Set() : new Set(drafts.map((d) => d.draftId)))}
                    className="text-[10px] text-cyan-300 hover:text-cyan-200">
              {selectedDrafts.size === drafts.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {drafts.map((d) => (
              <div key={d.draftId} className="cvp-row p-3 flex gap-3 is-pending">
                <input type="checkbox" className="accent-cyan-500 mt-1.5"
                       checked={selectedDrafts.has(d.draftId)} onChange={() => toggleDraft(d.draftId)} />
                <div className="relative w-24 h-24 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0 bg-black/40 group">
                  <img src={d.preview} alt={d.file.name} className="w-full h-full object-cover" />
                  {d.uploading && (
                    <div className="absolute inset-0 bg-black/70 grid place-items-center">
                      <Loader2 size={20} className="text-cyan-300 animate-spin" />
                    </div>
                  )}
                  <button onClick={() => removeDraft(d.draftId)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500/90 text-white grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-rose-500"
                          title="Xoá ảnh">
                    <X size={10} />
                  </button>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-cyan-400/70">#{String(d.draftId).padStart(2, "0")}</span>
                    <span className="text-[11px] text-slate-400 font-mono truncate">{d.file.name}</span>
                    <span className="text-[10px] text-slate-600">{(d.file.size / 1024).toFixed(0)} KB</span>
                    <div className="flex-1" />
                    {d.uploading
                      ? <span className="cvp-pill cvp-pill-running"><Loader2 size={10} className="animate-spin" /> Uploading</span>
                      : d.fileId
                        ? <span className="cvp-pill cvp-pill-success">✓ Ready</span>
                        : <span className="cvp-pill cvp-pill-danger">Upload failed</span>}
                  </div>
                  <textarea
                    value={d.prompt}
                    onChange={(e) => updatePrompt(d.draftId, e.target.value)}
                    placeholder="Mô tả chuyển động muốn áp dụng (vd: camera zoom in, character waves hand, mist drifting...)"
                    rows={2}
                    className="cvp-input w-full resize-none text-[11px] leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real job history */}
      <div className="cvp-card overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          Job lịch sử ({jobs.length})
        </div>
        {isLoading && jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">Đang tải...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center text-slate-500 py-12 text-xs italic flex flex-col items-center gap-2">
            <ImageIcon size={32} className="text-slate-600" />
            Chưa có job — kéo thả ảnh + viết prompt + bấm "Bắt Đầu".
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-3 py-2.5 w-12 text-[9px] uppercase tracking-widest text-slate-500 font-bold">ID</th>
                <th className="text-left px-3 py-2.5 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Prompt</th>
                <th className="text-left px-3 py-2.5 w-32 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Status</th>
                <th className="text-right px-3 py-2.5 w-40 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((j) => {
                const st = mapStatus(j.status);
                return (
                  <tr key={j.id} className={`cvp-row border-t border-white/5 is-${st}`}>
                    <td className="px-3 py-3 text-slate-500 font-mono text-[11px]">#{j.id.slice(0, 6)}</td>
                    <td className="px-3 py-3 text-slate-200 leading-relaxed">
                      {j.prompt}
                      {j.error_message && (
                        <div className="text-[10px] text-rose-400/80 mt-1 font-mono">⚠ {j.error_message}</div>
                      )}
                    </td>
                    <td className="px-3 py-3"><StatusPill status={st} /></td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-1">
                        {j.result_url && (
                          <button onClick={() => setPreviewJob(j)}
                             className="cvp-btn-violet inline-flex items-center gap-1 text-[10px] px-2.5 py-1">
                            <Play size={10} /> Xem
                          </button>
                        )}
                        {st === "running" && (
                          <button onClick={() => cancel.mutate(j.id)} className="cvp-btn-ghost text-[10px] px-2 py-1 text-amber-300">
                            <Square size={10} />
                          </button>
                        )}
                        {st === "failed" && (
                          <button onClick={() => retry.mutate(j.id)} className="cvp-btn-ghost text-[10px] px-2 py-1 text-cyan-300">
                            <RotateCcw size={10} />
                          </button>
                        )}
                        <button onClick={() => remove.mutate(j.id)} className="cvp-btn-ghost text-[10px] px-2 py-1 text-rose-400">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ProgressFooter total={jobs.length} success={successCount} failed={failedCount} />
      <LogPanel log={log} />

      {previewJob && (
        <PreviewModal
          url={previewJob.result_url}
          kind="video"
          filename={`video-${previewJob.id.slice(0, 8)}.mp4`}
          caption={previewJob.prompt}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </div>
  );
}
