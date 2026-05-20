import { useState } from "react";
import {
  ImagePlus, Eraser, Play, Square, RotateCcw, FolderOpen, Trash2, Plus, User, Loader2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import {
  LogEntry, ToolButton, StatusPill, VideoSettingsRow,
  BatchPanel, FolderPicker, ProgressFooter, LogPanel, PanelHeader, nowTs,
} from "./shared";
import {
  useGrokJobs, useUploadInput, useBatchSubmit, useLocalState,
  checkQuotaBeforeBatch, mapStatus, type JobRow,
} from "./hooks";
import { PreviewModal } from "./PreviewModal";

interface SceneDraft { draftId: number; text: string; }

/** Đồng bộ nhân vật — single ref + multi-scene videos. Each scene becomes
 *  a job with character description prepended to its prompt and the ref
 *  image attached as input_image_file_id. */
export function CharacterSyncPanel() {
  const { jobs, isLoading, submit, cancel, retry, remove, submitting } = useGrokJobs({ jobType: "video" });
  const upload = useUploadInput();

  const [refImage, setRefImage] = useState<{ file: File; preview: string } | null>(null);
  const [refFileId, setRefFileId] = useState<string | null>(null);
  const [charName, setCharName] = useState("");
  const [charDesc, setCharDesc] = useState("");

  const [scenes, setScenes] = useState<SceneDraft[]>([
    { draftId: 1, text: "Walking through a neon-lit Tokyo street at night, looking around curiously" },
    { draftId: 2, text: "Standing on a rooftop watching the sunrise, wind blowing through hair" },
    { draftId: 3, text: "Sitting in a cozy cafe with a cup of coffee, reading a book" },
  ]);
  const [draftSeq, setDraftSeq] = useState(4);
  const [selected, setSelected] = useState<Set<number>>(new Set([1, 2, 3]));

  const [ratio, setRatio]               = useLocalState("cvp.csync.ratio", "3:2");
  const [duration, setDuration]         = useLocalState("cvp.csync.duration", "6");
  const [resolution, setResolution]     = useLocalState("cvp.csync.resolution", "720p");
  const [count, setCount]               = useLocalState("cvp.csync.count", "1");
  const [batchEnabled, setBatchEnabled] = useLocalState("cvp.csync.batchEnabled", true);
  const [batchSize, setBatchSize]       = useLocalState("cvp.csync.batchSize", "3");
  const [batchDelay, setBatchDelay]     = useLocalState("cvp.csync.batchDelay", "12");
  const [hideFailed, setHideFailed]     = useLocalState("cvp.csync.hideFailed", false);
  const [folder, setFolder]             = useLocalState("cvp.csync.folder", "D:\\KamitoJes_QT\\Tool_AI\\Output\\Character_Sync");
  const [log, setLog] = useState<LogEntry[]>([]);
  const batch = useBatchSubmit<SceneDraft>();
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  const onRefDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setRefImage({ file: f, preview: URL.createObjectURL(f) });
    setRefFileId(null);
    setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `Uploading ${f.name}...` }]);
    try {
      const res = await upload.mutateAsync(f);
      setRefFileId(res.file_id);
      setLog((p) => [...p, { ts: nowTs(), level: "success", msg: `✓ Nhân vật ready: ${res.file_id.slice(0, 8)}` }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? "Upload thất bại";
      setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ ${msg}` }]);
      toast(msg, "error");
    }
  };

  const addScene = () => {
    setScenes((p) => [...p, { draftId: draftSeq, text: "" }]);
    setSelected((p) => { const s = new Set(p); s.add(draftSeq); return s; });
    setDraftSeq((n) => n + 1);
  };
  const updateScene = (id: number, text: string) =>
    setScenes((p) => p.map((s) => s.draftId === id ? { ...s, text } : s));
  const removeScene = (id: number) => {
    setScenes((p) => p.filter((s) => s.draftId !== id));
    setSelected((p) => { const s = new Set(p); s.delete(id); return s; });
  };
  const toggleSelect = (id: number) =>
    setSelected((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const buildPrompt = (sceneText: string): string => {
    const desc = charDesc.trim();
    const name = charName.trim();
    const header = [name && `Character: ${name}`, desc].filter(Boolean).join(". ");
    return header ? `${header}. Scene: ${sceneText.trim()}` : sceneText.trim();
  };

  const startBatch = async () => {
    if (!refFileId) { toast("Cần upload ảnh nhân vật trước", "error"); return; }
    const rawQueue = scenes.filter((s) => selected.has(s.draftId) && s.text.trim());
    if (rawQueue.length === 0) { toast("Cần ít nhất 1 cảnh có mô tả", "error"); return; }
    const queue = await checkQuotaBeforeBatch(rawQueue, toast);
    if (queue === null || queue.length === 0) return;
    setLog((p) => [...p, { ts: nowTs(), level: "info",
      msg: `▶ Submit ${queue.length} cảnh · char='${charName || "Unnamed"}'${batchEnabled ? ` · batch ${batchSize} delay ${batchDelay}s` : ""}` }]);

    await batch.run({
      items: queue,
      batchEnabled,
      batchSize: Number(batchSize) || 1,
      delaySec: Number(batchDelay) || 0,
      submit: (sc) => submit.mutateAsync({
        prompt: buildPrompt(sc.text),
        input_image_file_id: refFileId!,
        options: {
          aspect_ratio: ratio, duration: Number(duration), resolution,
          character_sync: true,
          character_name: charName.trim() || undefined,
        },
      }),
      onItemSuccess: (sc) => removeScene(sc.draftId),
      onItemError: (sc, e) => {
        const msg = (e as any)?.response?.data?.detail?.message ?? "Submit lỗi";
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ Scene #${sc.draftId}: ${msg}` }]);
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
    if (batch.running) setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Dừng batch loop...` }]);
    for (const j of active) { try { await cancel.mutateAsync(j.id); } catch { /* */ } }
    if (active.length) setLog((p) => [...p, { ts: nowTs(), level: "warn", msg: `⏹ Cancel ${active.length} job` }]);
  };
  const retryFailed = async () => {
    const failed = jobs.filter((j) => j.status === "failed");
    for (const j of failed) { try { await retry.mutateAsync(j.id); } catch { /* */ } }
    if (failed.length) setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `↻ Retry ${failed.length} job` }]);
  };

  const successCount = jobs.filter((j) => j.status === "success").length;
  const failedCount  = jobs.filter((j) => j.status === "failed").length;
  const visibleJobs = hideFailed
    ? jobs.filter((j) => j.status !== "failed" && j.status !== "cancelled")
    : jobs;

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Đồng bộ nhân vật (Character Sync)"
        subtitle={`Cùng 1 nhân vật, nhiều cảnh — ${jobs.length} job lịch sử · ${successCount} thành công · ${failedCount} lỗi`}
        accent="violet"
      />

      <div className="cvp-card p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <div className="text-[9px] uppercase tracking-widest text-violet-300 font-bold inline-flex items-center gap-1">
              <User size={10} /> Nhân vật tham chiếu
            </div>
            {refImage ? (
              <div className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-violet-400/30 bg-black/40">
                <img src={refImage.preview} alt="ref" className="w-full h-full object-cover" />
                {upload.isPending && (
                  <div className="absolute inset-0 bg-black/70 grid place-items-center">
                    <Loader2 size={24} className="text-violet-300 animate-spin" />
                  </div>
                )}
                {refFileId && !upload.isPending && (
                  <div className="absolute top-2 left-2">
                    <span className="cvp-pill cvp-pill-success">✓ Ready</span>
                  </div>
                )}
                <button onClick={() => { setRefImage(null); setRefFileId(null); }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500/90 text-white grid place-items-center hover:bg-rose-500">
                  <Trash2 size={11} />
                </button>
              </div>
            ) : (
              <label className="cvp-card cvp-card-hover aspect-square cursor-pointer flex flex-col items-center justify-center gap-2 ring-1 ring-violet-500/20">
                <input type="file" accept="image/*" className="hidden"
                       onChange={(e) => onRefDrop(Array.from(e.target.files ?? []))} />
                <div className="w-12 h-12 rounded-full bg-violet-500/15 ring-1 ring-violet-400/30 grid place-items-center">
                  <User size={20} className="text-violet-300" />
                </div>
                <div className="text-[12px] text-violet-200 font-medium">Chọn ảnh nhân vật</div>
                <div className="text-[10px] text-slate-500">PNG · JPG · 1:1 khuyến nghị</div>
              </label>
            )}
          </div>
          <div className="md:col-span-2 space-y-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Tên nhân vật</div>
              <input value={charName} onChange={(e) => setCharName(e.target.value)}
                     placeholder="VD: Aiko — cô gái Nhật tóc đen"
                     className="cvp-input w-full" />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Mô tả ngoại hình (prepend vào prompt mỗi cảnh)</div>
              <textarea value={charDesc} onChange={(e) => setCharDesc(e.target.value)}
                        placeholder="VD: 20 tuổi, tóc đen ngang vai, mắt nâu, áo hoodie xám, jean ống suông, balo da, vẻ điềm tĩnh"
                        rows={3}
                        className="cvp-input w-full resize-none text-[11px] leading-relaxed" />
            </div>
            <div className="text-[10px] text-violet-300/60 inline-flex items-start gap-1.5">
              <span className="text-violet-300 mt-0.5">💡</span>
              <span>Mỗi cảnh sẽ submit thành 1 video job riêng với ảnh + mô tả này làm tham chiếu.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="cvp-card p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton icon={Plus} onClick={addScene}>Thêm Cảnh</ToolButton>
          <ToolButton icon={ImagePlus}>Import Scenes</ToolButton>
          <ToolButton icon={Eraser} onClick={() => setScenes([])}>Clear</ToolButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={Play} variant="primary" onClick={startBatch}
                      disabled={submitting || !refFileId || selected.size === 0}>
            Bắt Đầu ({selected.size})
          </ToolButton>
          <ToolButton icon={Square} variant="danger" onClick={stopAll}>Dừng</ToolButton>
          <ToolButton icon={RotateCcw} onClick={retryFailed}>Retry Lỗi</ToolButton>
          <div className="flex-1" />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input type="checkbox" className="accent-cyan-500"
                   checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} />
            Ẩn lỗi
          </label>
        </div>
      </div>

      <VideoSettingsRow ratio={ratio} setRatio={setRatio} duration={duration} setDuration={setDuration}
                        resolution={resolution} setResolution={setResolution} count={count} setCount={setCount} />
      <BatchPanel enabled={batchEnabled} setEnabled={setBatchEnabled}
                  size={batchSize} setSize={setBatchSize} delay={batchDelay} setDelay={setBatchDelay}
                  waitState={batch.waitState} />
      <FolderPicker folder={folder} onChange={setFolder} />

      {scenes.length > 0 && (
        <div className="cvp-card overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">
            Scenes đang soạn ({scenes.length})
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-3 py-2.5 w-10 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Sel</th>
                <th className="text-left px-3 py-2.5 w-12 text-[9px] uppercase tracking-widest text-slate-500 font-bold">#</th>
                <th className="text-left px-3 py-2.5 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Mô tả cảnh</th>
                <th className="text-right px-3 py-2.5 w-20 text-[9px] uppercase tracking-widest text-slate-500 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {scenes.map((s) => (
                <tr key={s.draftId} className="cvp-row border-t border-white/5 is-pending">
                  <td className="px-3 py-3"><input type="checkbox" className="accent-violet-500"
                                                    checked={selected.has(s.draftId)} onChange={() => toggleSelect(s.draftId)} /></td>
                  <td className="px-3 py-3 text-slate-500 font-mono text-[11px]">#{String(s.draftId).padStart(2, "0")}</td>
                  <td className="px-3 py-3">
                    <textarea value={s.text} onChange={(e) => updateScene(s.draftId, e.target.value)}
                              placeholder="Mô tả cảnh — vd: cô ấy đang đi bộ trên cầu vào hoàng hôn..."
                              rows={2}
                              className="cvp-input w-full resize-none text-[11px] leading-relaxed" />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => removeScene(s.draftId)} className="cvp-btn-ghost text-[10px] px-2 py-1">
                      <Trash2 size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cvp-card overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          Job lịch sử ({jobs.length})
        </div>
        {isLoading && jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">Đang tải...</div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">
            Chưa có job — upload nhân vật + thêm cảnh + Bắt Đầu.
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
                      {j.error_message && <div className="text-[10px] text-rose-400/80 mt-1 font-mono">⚠ {j.error_message}</div>}
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
          filename={`charsync-${previewJob.id.slice(0, 8)}.mp4`}
          caption={previewJob.prompt}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </div>
  );
}
