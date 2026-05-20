import { useEffect, useRef, useState } from "react";
import { ImagePlus, Eraser, Play, Square, RotateCcw, FolderOpen, Trash2, Plus } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import {
  LogEntry, ToolButton, StatusPill, VideoSettingsRow,
  BatchPanel, FolderPicker, ProgressFooter, LogPanel, PanelHeader, nowTs,
} from "./shared";
import {
  useGrokJobs, useBatchSubmit, useLocalState, checkQuotaBeforeBatch,
  mapStatus, JobRow, parsePromptFile,
} from "./hooks";
import { PreviewModal } from "./PreviewModal";

interface DraftPrompt {
  draftId: number;
  text: string;
}

/** Text → Video Pro panel — pulls real Grok video jobs from /api/jobs.
 *
 *  Two row types live in the table:
 *    - DraftPrompt: user typed it but hasn't submitted yet (no job_id)
 *    - JobRow:      already in the queue / running / done — backed by DB
 *  Selecting a draft + clicking "Bắt Đầu" POSTs and converts it to a Job. */
export function TextToVideoPanel() {
  const { jobs, isLoading, submit, cancel, retry, remove, submitting } = useGrokJobs({ jobType: "video" });
  const [drafts, setDrafts] = useState<DraftPrompt[]>([]);
  const [draftSeq, setDraftSeq] = useState(1);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectedDrafts, setSelectedDrafts] = useState<Set<number>>(new Set());

  // Settings persisted to localStorage so user doesn't re-pick on reload.
  const [ratio, setRatio]           = useLocalState("cvp.t2v.ratio", "3:2");
  const [duration, setDuration]     = useLocalState("cvp.t2v.duration", "6");
  const [resolution, setResolution] = useLocalState("cvp.t2v.resolution", "720p");
  const [count, setCount]           = useLocalState("cvp.t2v.count", "1");
  const [batchEnabled, setBatchEnabled] = useLocalState("cvp.t2v.batchEnabled", true);
  const [batchSize, setBatchSize]       = useLocalState("cvp.t2v.batchSize", "5");
  const [batchDelay, setBatchDelay]     = useLocalState("cvp.t2v.batchDelay", "10");
  const [folder, setFolder]             = useLocalState("cvp.t2v.folder", "D:\\KamitoJes_QT\\Tool_AI\\Output\\Text_Video_Grok");
  const [hideFailed, setHideFailed]     = useLocalState("cvp.t2v.hideFailed", false);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Shared batch hook handles chunking + delay countdown + stop. Replaces
  // the per-panel inline loop that previously lived here.
  const batch = useBatchSubmit<DraftPrompt>();

  // Which job we're previewing in the modal (null = closed).
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  // Import JSON / .txt file → bulk-create drafts.
  const importInputRef = useRef<HTMLInputElement>(null);
  const onImportPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const prompts = await parsePromptFile(files[0]);
      if (prompts.length === 0) { toast("File rỗng hoặc không có prompt nào", "error"); return; }
      setDrafts((p) => [...p, ...prompts.map((text, i) => ({ draftId: draftSeq + i, text }))]);
      setSelectedDrafts((p) => { const s = new Set(p); for (let i = 0; i < prompts.length; i++) s.add(draftSeq + i); return s; });
      setDraftSeq((n) => n + prompts.length);
      setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `📥 Import ${prompts.length} prompt(s) từ ${files[0].name}` }]);
    } catch (e: any) {
      toast(`Đọc file lỗi: ${e?.message ?? "unknown"}`, "error");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };

  // Append a log entry per status change. Tracks last-seen status per
  // job so we don't spam log lines on every poll.
  const [lastStatus, setLastStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = { ...lastStatus };
    let added = false;
    for (const j of jobs) {
      if (lastStatus[j.id] === j.status) continue;
      next[j.id] = j.status;
      added = true;
      const short = `#${j.id.slice(0, 8)}`;
      if (j.status === "success") setLog((p) => [...p, { ts: nowTs(), level: "success", msg: `✓ ${short} HOÀN THÀNH` }]);
      else if (j.status === "failed") setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ ${short} thất bại — ${j.error_message ?? "unknown"}` }]);
      else if (j.status === "running" || j.status === "processing_provider") setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `▶ ${short} đang xử lý...` }]);
    }
    if (added) setLastStatus(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const addDraft = () => {
    setDrafts((prev) => [...prev, { draftId: draftSeq, text: "" }]);
    setSelectedDrafts((prev) => { const s = new Set(prev); s.add(draftSeq); return s; });
    setDraftSeq((n) => n + 1);
  };
  const updateDraft = (id: number, text: string) =>
    setDrafts((prev) => prev.map((d) => d.draftId === id ? { ...d, text } : d));
  const removeDraft = (id: number) => {
    setDrafts((prev) => prev.filter((d) => d.draftId !== id));
    setSelectedDrafts((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };
  const toggleDraft = (id: number) =>
    setSelectedDrafts((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const toggleJob = (id: string) =>
    setSelectedJobs((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const startBatch = async () => {
    const rawQueue = drafts.filter((d) => selectedDrafts.has(d.draftId) && d.text.trim());
    if (rawQueue.length === 0) { toast("Cần ít nhất 1 prompt có nội dung", "error"); return; }
    const queue = await checkQuotaBeforeBatch(rawQueue, toast);
    if (queue === null || queue.length === 0) return;
    setLog((p) => [...p, { ts: nowTs(), level: "info",
      msg: `▶ Submit ${queue.length} prompt(s)${batchEnabled ? ` · batch ${batchSize} · delay ${batchDelay}s` : ""}` }]);

    await batch.run({
      items: queue,
      batchEnabled,
      batchSize: Number(batchSize) || 1,
      delaySec: Number(batchDelay) || 0,
      submit: (d) => submit.mutateAsync({
        prompt: d.text,
        options: { aspect_ratio: ratio, duration: Number(duration), resolution },
      }),
      onItemSuccess: (d) => {
        // Remove draft once submitted — the job row now represents it.
        setDrafts((prev) => prev.filter((x) => x.draftId !== d.draftId));
        setSelectedDrafts((prev) => { const s = new Set(prev); s.delete(d.draftId); return s; });
      },
      onItemError: (d, e) => {
        const msg = (e as any)?.response?.data?.detail?.message ?? "Submit lỗi";
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ Draft #${d.draftId}: ${msg}` }]);
      },
      onBatchDone: (idx, total, ok, fail) => {
        const lvl = fail > 0 ? "warn" : "success";
        setLog((p) => [...p, { ts: nowTs(), level: lvl, msg: `Batch ${idx}/${total}: ${ok} ok · ${fail} fail` }]);
      },
    });
  };

  const stopAll = async () => {
    // Stop the batch loop AND cancel any in-flight jobs.
    batch.stop();
    const cancelable = jobs.filter((j) => !["success", "failed", "cancelled"].includes(j.status));
    if (cancelable.length === 0 && !batch.running) {
      toast("Không có gì đang chạy để dừng", "info");
      return;
    }
    if (batch.running) setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Dừng batch loop...` }]);
    if (cancelable.length > 0) {
      setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Cancel ${cancelable.length} job đang chạy...` }]);
      for (const j of cancelable) {
        try { await cancel.mutateAsync(j.id); } catch { /* keep going */ }
      }
    }
  };

  const retryFailed = async () => {
    const failed = jobs.filter((j) => j.status === "failed");
    if (failed.length === 0) { toast("Không có job thất bại để chạy lại", "info"); return; }
    setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `↻ Retry ${failed.length} job thất bại...` }]);
    for (const j of failed) {
      try { await retry.mutateAsync(j.id); } catch { /* ignore */ }
    }
  };

  // Counters across ALL jobs (drafts excluded — they haven't been submitted yet).
  const totalJobs = jobs.length;
  const successCount = jobs.filter((j) => j.status === "success").length;
  const failedCount  = jobs.filter((j) => j.status === "failed").length;
  // When "Ẩn video lỗi" is on, drop failed/cancelled rows from the table.
  // Counter row at the bottom still shows the real totals (Tổng / Success
  // / Fail) so the user can see them; just removing the rows tidies the
  // table during a long batch run with mixed outcomes.
  const visibleJobs = hideFailed
    ? jobs.filter((j) => j.status !== "failed" && j.status !== "cancelled")
    : jobs;
  const selectedCount = selectedDrafts.size + selectedJobs.size;

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Text → Video Pro"
        subtitle={`Tạo video AI hàng loạt — ${jobs.length} job trong lịch sử · ${successCount} thành công · ${failedCount} lỗi`}
        accent="cyan"
      />

      {/* Toolbar */}
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
          <ToolButton
            icon={Play}
            variant="primary"
            onClick={startBatch}
            disabled={submitting || drafts.length === 0 || selectedDrafts.size === 0}
          >
            Bắt Đầu ({selectedDrafts.size})
          </ToolButton>
          <ToolButton icon={Square} variant="danger" onClick={stopAll}>Dừng Lại</ToolButton>
          <ToolButton icon={RotateCcw} onClick={retryFailed}>Retry Lỗi</ToolButton>
          <div className="flex-1" />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input type="checkbox" className="accent-cyan-500"
                   checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} />
            Ẩn video lỗi
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input
              type="checkbox" className="accent-cyan-500"
              checked={drafts.length > 0 && selectedDrafts.size === drafts.length}
              onChange={() => setSelectedDrafts(
                selectedDrafts.size === drafts.length ? new Set() : new Set(drafts.map((d) => d.draftId)),
              )}
            />
            Chọn tất cả drafts
          </label>
        </div>
      </div>

      <VideoSettingsRow ratio={ratio} setRatio={setRatio} duration={duration} setDuration={setDuration}
                        resolution={resolution} setResolution={setResolution} count={count} setCount={setCount} />
      <BatchPanel enabled={batchEnabled} setEnabled={setBatchEnabled}
                  size={batchSize} setSize={setBatchSize} delay={batchDelay} setDelay={setBatchDelay}
                  waitState={batch.waitState} />
      <FolderPicker folder={folder} onChange={setFolder} />

      {/* Combined drafts + jobs table */}
      <div className="cvp-card overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Hàng đợi & lịch sử ({drafts.length} draft · {jobs.length} job)
          </div>
          <div className="text-[10px] text-slate-500">
            Chọn: <span className="text-cyan-300">{selectedCount}</span>
          </div>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2.5 w-10 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Sel</th>
              <th className="text-left px-3 py-2.5 w-12 text-[9px] uppercase tracking-widest text-slate-500 font-bold">ID</th>
              <th className="text-left px-3 py-2.5 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Prompt</th>
              <th className="text-left px-3 py-2.5 w-32 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Status</th>
              <th className="text-right px-3 py-2.5 w-40 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && jobs.length === 0 && drafts.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-slate-500 py-12 text-xs italic">Đang tải job history...</td></tr>
            ) : drafts.length === 0 && jobs.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-slate-500 py-12 text-xs italic">
                Chưa có job nào — bấm "Thêm Prompt" để bắt đầu.
              </td></tr>
            ) : (
              <>
                {/* Drafts on top */}
                {drafts.map((d) => (
                  <tr key={`d-${d.draftId}`} className="cvp-row border-t border-white/5 is-pending">
                    <td className="px-3 py-3"><input type="checkbox" className="accent-cyan-500"
                                                     checked={selectedDrafts.has(d.draftId)}
                                                     onChange={() => toggleDraft(d.draftId)} /></td>
                    <td className="px-3 py-3 text-amber-400/80 font-mono text-[11px]">draft</td>
                    <td className="px-3 py-3">
                      <textarea
                        value={d.text}
                        onChange={(e) => updateDraft(d.draftId, e.target.value)}
                        placeholder="Mô tả video muốn tạo... (sẽ submit khi bấm Bắt Đầu)"
                        rows={2}
                        className="cvp-input w-full resize-none text-[11px] leading-relaxed"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="cvp-pill cvp-pill-idle">Draft</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => removeDraft(d.draftId)}
                              className="cvp-btn-ghost inline-flex items-center gap-1 text-[10px] px-2.5 py-1">
                        <Trash2 size={10} /> Xoá
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Real jobs */}
                {visibleJobs.map((j) => (
                  <JobRowItem key={j.id} job={j}
                              selected={selectedJobs.has(j.id)}
                              onToggle={() => toggleJob(j.id)}
                              onCancel={() => cancel.mutate(j.id)}
                              onRetry={() => retry.mutate(j.id)}
                              onRemove={() => remove.mutate(j.id)}
                              onPreview={() => setPreviewJob(j)} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <ProgressFooter total={totalJobs} success={successCount} failed={failedCount} />
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

function JobRowItem({
  job, selected, onToggle, onCancel, onRetry, onRemove, onPreview,
}: {
  job: JobRow; selected: boolean;
  onToggle: () => void;
  onCancel: () => void; onRetry: () => void; onRemove: () => void;
  onPreview: () => void;
}) {
  const status = mapStatus(job.status);
  const isActive = status === "running";
  return (
    <tr className={`cvp-row border-t border-white/5 is-${status}`}>
      <td className="px-3 py-3"><input type="checkbox" className="accent-cyan-500"
                                       checked={selected} onChange={onToggle} /></td>
      <td className="px-3 py-3 text-slate-500 font-mono text-[11px]" title={job.id}>
        #{job.id.slice(0, 6)}
      </td>
      <td className="px-3 py-3 text-slate-200 leading-relaxed">
        {job.prompt}
        {job.error_message && (
          <div className="text-[10px] text-rose-400/80 mt-1 font-mono">
            ⚠ {job.error_message}
          </div>
        )}
      </td>
      <td className="px-3 py-3"><StatusPill status={status} /></td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex gap-1">
          {job.result_url && (
            <button onClick={onPreview}
               className="cvp-btn-violet inline-flex items-center gap-1 text-[10px] px-2.5 py-1">
              <Play size={10} /> Xem
            </button>
          )}
          {isActive && (
            <button onClick={onCancel}
                    className="cvp-btn-ghost inline-flex items-center gap-1 text-[10px] px-2 py-1 text-amber-300">
              <Square size={10} />
            </button>
          )}
          {status === "failed" && (
            <button onClick={onRetry}
                    className="cvp-btn-ghost inline-flex items-center gap-1 text-[10px] px-2 py-1 text-cyan-300">
              <RotateCcw size={10} />
            </button>
          )}
          <button onClick={onRemove}
                  className="cvp-btn-ghost inline-flex items-center gap-1 text-[10px] px-2 py-1 text-rose-400">
            <Trash2 size={10} />
          </button>
        </div>
      </td>
    </tr>
  );
}
