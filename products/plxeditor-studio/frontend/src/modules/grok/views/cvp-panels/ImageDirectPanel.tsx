import { useRef, useState } from "react";
import {
  ImagePlus, Eraser, Play, Square, RotateCcw, FolderOpen, Trash2, Plus,
  Camera, Eye, Download, Sparkles,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import {
  LogEntry, ToolButton, StatusPill, ImageSettingsRow,
  BatchPanel, FolderPicker, ProgressFooter, LogPanel, PanelHeader, nowTs,
} from "./shared";
import {
  useGrokJobs, useBatchSubmit, useLocalState, checkQuotaBeforeBatch,
  mapStatus, parsePromptFile, JobRow,
} from "./hooks";
import { AuthedImage, downloadAuthed } from "./media";
import { PreviewModal } from "./PreviewModal";

interface Draft { draftId: number; text: string; }

/** Tạo ảnh trực tiếp — pure text-to-image batch wired to /api/jobs.
 *  Loads job history of job_type=image, supports submit/cancel/retry. */
export function ImageDirectPanel() {
  const { jobs, isLoading, submit, cancel, retry, remove, submitting } = useGrokJobs({ jobType: "image" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftSeq, setDraftSeq] = useState(1);
  const [selectedDrafts, setSelectedDrafts] = useState<Set<number>>(new Set());

  const [ratio, setRatio]               = useLocalState("cvp.imgdir.ratio", "1:1");
  const [quality, setQuality]           = useLocalState("cvp.imgdir.quality", "quality");
  const [count, setCount]               = useLocalState("cvp.imgdir.count", "1");
  const [style, setStyle]               = useLocalState("cvp.imgdir.style", "natural");
  const [batchEnabled, setBatchEnabled] = useLocalState("cvp.imgdir.batchEnabled", false);
  const [batchSize, setBatchSize]       = useLocalState("cvp.imgdir.batchSize", "10");
  const [batchDelay, setBatchDelay]     = useLocalState("cvp.imgdir.batchDelay", "5");
  const [hideFailed, setHideFailed]     = useLocalState("cvp.imgdir.hideFailed", false);
  const [folder, setFolder]             = useLocalState("cvp.imgdir.folder", "D:\\KamitoJes_QT\\Tool_AI\\Output\\Image_Direct");
  const batch = useBatchSubmit<Draft>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  // Hidden file input for "Import JSON". User picks a .json or .txt file
  // → parsePromptFile extracts prompts → each prompt becomes a new draft.
  const importInputRef = useRef<HTMLInputElement>(null);
  const onImportPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const prompts = await parsePromptFile(files[0]);
      if (prompts.length === 0) {
        toast("File rỗng hoặc không có prompt nào", "error");
        return;
      }
      setDrafts((p) => [
        ...p,
        ...prompts.map((text, i) => ({ draftId: draftSeq + i, text })),
      ]);
      setSelectedDrafts((p) => {
        const s = new Set(p);
        for (let i = 0; i < prompts.length; i++) s.add(draftSeq + i);
        return s;
      });
      setDraftSeq((n) => n + prompts.length);
      setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `📥 Import ${prompts.length} prompt(s) từ ${files[0].name}` }]);
    } catch (e: any) {
      toast(`Đọc file lỗi: ${e?.message ?? "unknown"}`, "error");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const addDraft = () => {
    setDrafts((p) => [...p, { draftId: draftSeq, text: "" }]);
    setSelectedDrafts((p) => { const s = new Set(p); s.add(draftSeq); return s; });
    setDraftSeq((n) => n + 1);
  };
  const updateDraft = (id: number, text: string) =>
    setDrafts((p) => p.map((d) => d.draftId === id ? { ...d, text } : d));
  const removeDraft = (id: number) => {
    setDrafts((p) => p.filter((d) => d.draftId !== id));
    setSelectedDrafts((p) => { const s = new Set(p); s.delete(id); return s; });
  };
  const toggleDraft = (id: number) =>
    setSelectedDrafts((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  // Grok image mode picks ratio from prompt or aspect button. `size` is
  // passed as a hint that the provider also forwards as an aria-label-based
  // aspect ratio (see backend grok_provider.py:_size_to_ratio). Standard
  // dimensions that Grok recognises:
  const sizeFromRatio = (r: string): string => {
    switch (r) {
      case "16:9": return "1280x720";
      case "9:16": return "720x1280";
      case "4:3":  return "1024x768";
      case "3:4":  return "768x1024";
      case "3:2":  return "1280x854";
      default:     return "1024x1024"; // 1:1 default
    }
  };

  const startBatch = async () => {
    const rawQueue = drafts.filter((d) => selectedDrafts.has(d.draftId) && d.text.trim());
    if (rawQueue.length === 0) { toast("Cần ít nhất 1 prompt có nội dung", "error"); return; }
    const queue = await checkQuotaBeforeBatch(rawQueue, toast);
    if (queue === null || queue.length === 0) return;
    setLog((p) => [...p, { ts: nowTs(), level: "info",
      msg: `▶ Submit ${queue.length} ảnh${batchEnabled ? ` · batch ${batchSize} · delay ${batchDelay}s` : ""}` }]);

    await batch.run({
      items: queue,
      batchEnabled,
      batchSize: Number(batchSize) || 1,
      delaySec: Number(batchDelay) || 0,
      submit: (d) => submit.mutateAsync({
        prompt: d.text,
        size: sizeFromRatio(ratio),
        style,
        n: Math.min(4, Math.max(1, Number(count) || 1)),
        options: { quality, aspect_ratio: ratio },
      }),
      onItemSuccess: (d) => {
        setDrafts((p) => p.filter((x) => x.draftId !== d.draftId));
        setSelectedDrafts((p) => { const s = new Set(p); s.delete(d.draftId); return s; });
      },
      onItemError: (d, e) => {
        const msg = (e as any)?.response?.data?.detail?.message ?? "Submit lỗi";
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ Draft #${d.draftId}: ${msg}` }]);
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
        title="Tạo ảnh trực tiếp"
        subtitle={`Batch text-to-image — ${jobs.length} ảnh trong lịch sử · ${successCount} thành công · ${failedCount} lỗi`}
        accent="cyan"
      />

      <div className="cvp-card p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton icon={Plus} onClick={addDraft}>Thêm Prompt</ToolButton>
          <ToolButton icon={ImagePlus} onClick={() => importInputRef.current?.click()}>Import JSON</ToolButton>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={(e) => onImportPicked(e.target.files)}
          />
          <ToolButton icon={Eraser} onClick={() => setDrafts([])}>Clear Drafts</ToolButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={Play} variant="primary" onClick={startBatch}
                      disabled={submitting || selectedDrafts.size === 0}>
            Tạo Ảnh ({selectedDrafts.size})
          </ToolButton>
          <ToolButton icon={Square} variant="danger" onClick={stopAll}>Dừng</ToolButton>
          <ToolButton icon={RotateCcw} onClick={retryFailed}>Retry Lỗi</ToolButton>
          <div className="flex-1" />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input type="checkbox" className="accent-cyan-500"
                   checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} />
            Ẩn ảnh lỗi
          </label>
        </div>
      </div>

      <ImageSettingsRow ratio={ratio} setRatio={setRatio} quality={quality} setQuality={setQuality}
                        style={style} setStyle={setStyle} count={count} setCount={setCount} />
      <BatchPanel enabled={batchEnabled} setEnabled={setBatchEnabled}
                  size={batchSize} setSize={setBatchSize} delay={batchDelay} setDelay={setBatchDelay}
                  waitState={batch.waitState} />
      <FolderPicker folder={folder} onChange={setFolder} />

      {drafts.length > 0 && (
        <div className="cvp-card overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">
            Drafts đang soạn ({drafts.length})
          </div>
          <div className="divide-y divide-white/5">
            {drafts.map((d) => (
              <div key={d.draftId} className="p-2.5 flex gap-2.5">
                <input type="checkbox" className="accent-cyan-500 mt-2"
                       checked={selectedDrafts.has(d.draftId)} onChange={() => toggleDraft(d.draftId)} />
                <textarea value={d.text} onChange={(e) => updateDraft(d.draftId, e.target.value)}
                          rows={2}
                          placeholder="Mô tả ảnh muốn tạo..."
                          className="cvp-input flex-1 resize-none text-[11px] leading-relaxed" />
                <button onClick={() => removeDraft(d.draftId)} className="cvp-btn-ghost text-[10px] px-2 py-1 self-start">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cvp-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-cyan-300" /> Job lịch sử ({jobs.length})
          </div>
        </div>
        {isLoading && jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">Đang tải...</div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic flex flex-col items-center gap-2">
            <Camera size={32} className="text-slate-700" />
            Chưa có ảnh — bấm "Thêm Prompt" để bắt đầu.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 p-3">
            {visibleJobs.map((j) => {
              const st = mapStatus(j.status);
              const ringCls = st === "success" ? "ring-emerald-400/30"
                            : st === "failed"  ? "ring-rose-400/30"
                            : st === "running" ? "ring-amber-400/30" : "";
              return (
                <div key={j.id} className={`cvp-card cvp-card-hover p-2.5 space-y-2 ${ringCls}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-cyan-400/70">#{j.id.slice(0, 6)}</span>
                    <div className="flex-1" />
                    <StatusPill status={st} />
                  </div>
                  <div className="aspect-square rounded-md bg-gradient-to-br from-slate-800/60 to-slate-900/80 ring-1 ring-white/5 grid place-items-center overflow-hidden">
                    {j.result_url
                      ? <AuthedImage url={j.result_url} className="w-full h-full object-cover" />
                      : st === "running" ? <Sparkles size={28} className="text-amber-400/60 animate-pulse" />
                      : <Camera size={28} className="text-slate-700" />}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-relaxed line-clamp-3" title={j.prompt}>
                    {j.prompt}
                  </div>
                  {j.error_message && (
                    <div className="text-[10px] text-rose-400/80 font-mono line-clamp-2" title={j.error_message}>
                      ⚠ {j.error_message}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    {j.result_url && (
                      <>
                        <button onClick={() => setPreviewJob(j)}
                           className="cvp-btn-violet flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1">
                          <Eye size={10} /> Xem
                        </button>
                        <button onClick={() => downloadAuthed(j.result_url!, `image-${j.id.slice(0, 8)}.png`)}
                           className="cvp-btn-teal flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1">
                          <Download size={10} />
                        </button>
                      </>
                    )}
                    {st === "running" && (
                      <button onClick={() => cancel.mutate(j.id)}
                              className="cvp-btn-ghost flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1 text-amber-300">
                        <Square size={10} /> Dừng
                      </button>
                    )}
                    {st === "failed" && (
                      <button onClick={() => retry.mutate(j.id)}
                              className="cvp-btn-ghost flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1 text-cyan-300">
                        <RotateCcw size={10} /> Retry
                      </button>
                    )}
                    <button onClick={() => remove.mutate(j.id)}
                            className="cvp-btn-ghost inline-flex items-center justify-center text-[10px] px-2 py-1 text-rose-400">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProgressFooter total={jobs.length} success={successCount} failed={failedCount} />
      <LogPanel log={log} />

      {previewJob && (
        <PreviewModal
          url={previewJob.result_url}
          kind="image"
          filename={`image-${previewJob.id.slice(0, 8)}.png`}
          caption={previewJob.prompt}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </div>
  );
}
