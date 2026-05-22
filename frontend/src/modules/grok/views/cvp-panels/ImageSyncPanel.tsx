import { useRef, useState } from "react";
import {
  ImagePlus, Eraser, Play, Square, RotateCcw, Trash2, Plus,
  Camera, User, Eye, Download, Loader2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import {
  LogEntry, ToolButton, StatusPill, ImageSettingsRow,
  BatchPanel, FolderPicker, ProgressFooter, LogPanel, PanelHeader, nowTs,
} from "./shared";
import {
  useGrokJobs, useUploadInput, useBatchSubmit, useLocalState,
  checkQuotaBeforeBatch, mapStatus, parsePromptFile, type JobRow,
} from "./hooks";
import { AuthedImage, downloadAuthed } from "./media";
import { PreviewModal } from "./PreviewModal";

const POSE_PRESETS = [
  "Portrait shot, looking straight at camera, soft front lighting",
  "Side profile, looking left, dramatic side lighting",
  "Three-quarter view, slight smile, natural daylight",
  "Action shot, mid-movement, motion blur background",
  "Close-up portrait, eye-level, shallow depth of field",
];

interface PoseDraft { draftId: number; text: string; }

/** Tạo ảnh đồng bộ — same character, multi-pose images. Same pattern as
 *  CharacterSync but job_type=image and rendered as gallery grid. */
export function ImageSyncPanel() {
  const { jobs, isLoading, submit, cancel, retry, remove, submitting } = useGrokJobs({ jobType: "image" });
  const upload = useUploadInput();

  const [refImage, setRefImage] = useState<{ file: File; preview: string } | null>(null);
  const [refFileId, setRefFileId] = useState<string | null>(null);
  const [charName, setCharName] = useState("");
  const [charDesc, setCharDesc] = useState("");

  const [poses, setPoses] = useState<PoseDraft[]>(
    POSE_PRESETS.map((text, i) => ({ draftId: i + 1, text }))
  );
  const [draftSeq, setDraftSeq] = useState(POSE_PRESETS.length + 1);
  const [selected, setSelected] = useState<Set<number>>(new Set(poses.map((p) => p.draftId)));

  const [ratio, setRatio]               = useLocalState("cvp.isync.ratio", "1:1");
  const [quality, setQuality]           = useLocalState("cvp.isync.quality", "quality");
  const [count, setCount]               = useLocalState("cvp.isync.count", "1");
  const [style, setStyle]               = useLocalState("cvp.isync.style", "natural");
  const [batchEnabled, setBatchEnabled] = useLocalState("cvp.isync.batchEnabled", true);
  const [batchSize, setBatchSize]       = useLocalState("cvp.isync.batchSize", "5");
  const [batchDelay, setBatchDelay]     = useLocalState("cvp.isync.batchDelay", "8");
  const [hideFailed, setHideFailed]     = useLocalState("cvp.isync.hideFailed", false);
  const [folder, setFolder]             = useLocalState("cvp.isync.folder", "D:\\KamitoJes_QT\\Tool_AI\\Output\\Image_Sync");
  const [log, setLog] = useState<LogEntry[]>([]);
  const batch = useBatchSubmit<PoseDraft>();
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  const sizeFromRatio = (r: string): string => {
    switch (r) {
      case "16:9": return "1280x720";
      case "9:16": return "720x1280";
      case "4:3":  return "1024x768";
      case "3:4":  return "768x1024";
      case "3:2":  return "1280x854";
      default:     return "1024x1024";
    }
  };

  const onRefDrop = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setRefImage({ file: f, preview: URL.createObjectURL(f) });
    setRefFileId(null);
    setLog((p) => [...p, { ts: nowTs(), level: "info", msg: `Uploading ${f?.name ?? "file"}...` }]);
    try {
      const res = await upload.mutateAsync(f);
      setRefFileId(res.file_id);
      setLog((p) => [...p, { ts: nowTs(), level: "success", msg: `✓ Ready: ${res.file_id.slice(0, 8)}` }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? "Upload thất bại";
      setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ ${msg}` }]);
      toast(msg, "error");
    }
  };

  const addPose = () => {
    setPoses((p) => [...p, { draftId: draftSeq, text: "" }]);
    setSelected((p) => { const s = new Set(p); s.add(draftSeq); return s; });
    setDraftSeq((n) => n + 1);
  };

  // Import Poses từ JSON/txt — cùng pattern với CharacterSync/TextToVideo
  const importInputRef = useRef<HTMLInputElement>(null);
  const onImportPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const lines = await parsePromptFile(files[0]);
      if (lines.length === 0) {
        toast("File rỗng hoặc không parse được pose nào", "error");
        return;
      }
      setPoses((p) => [
        ...p,
        ...lines.map((text, i) => ({ draftId: draftSeq + i, text })),
      ]);
      setSelected((p) => {
        const s = new Set(p);
        for (let i = 0; i < lines.length; i++) s.add(draftSeq + i);
        return s;
      });
      setDraftSeq((n) => n + lines.length);
      setLog((p) => [
        ...p,
        { ts: nowTs(), level: "info", msg: `📥 Import ${lines.length} pose(s) từ ${files[0].name}` },
      ]);
    } catch (e: any) {
      toast(`Đọc file lỗi: ${e?.message ?? "unknown"}`, "error");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };
  const addPreset = (text: string) => {
    setPoses((p) => [...p, { draftId: draftSeq, text }]);
    setSelected((p) => { const s = new Set(p); s.add(draftSeq); return s; });
    setDraftSeq((n) => n + 1);
  };
  const updatePose = (id: number, text: string) =>
    setPoses((p) => p.map((s) => s.draftId === id ? { ...s, text } : s));
  const removePose = (id: number) => {
    setPoses((p) => p.filter((s) => s.draftId !== id));
    setSelected((p) => { const s = new Set(p); s.delete(id); return s; });
  };
  const toggleSelect = (id: number) =>
    setSelected((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const buildPrompt = (poseText: string): string => {
    const desc = charDesc.trim();
    const name = charName.trim();
    const header = [name && `Character: ${name}`, desc].filter(Boolean).join(". ");
    return header ? `${header}. ${poseText.trim()}` : poseText.trim();
  };

  const startBatch = async () => {
    if (!refFileId) { toast("Cần upload ảnh nhân vật", "error"); return; }
    const rawQueue = poses.filter((s) => selected.has(s.draftId) && s.text.trim());
    if (rawQueue.length === 0) { toast("Cần ít nhất 1 pose", "error"); return; }
    const queue = await checkQuotaBeforeBatch(rawQueue, toast);
    if (queue === null || queue.length === 0) return;
    setLog((p) => [...p, { ts: nowTs(), level: "info",
      msg: `▶ Tạo ${queue.length} ảnh đồng bộ · char='${charName || "Unnamed"}'${batchEnabled ? ` · batch ${batchSize} delay ${batchDelay}s` : ""}` }]);

    await batch.run({
      items: queue,
      batchEnabled,
      batchSize: Number(batchSize) || 1,
      delaySec: Number(batchDelay) || 0,
      submit: (pose) => submit.mutateAsync({
        prompt: buildPrompt(pose.text),
        input_image_file_id: refFileId!,
        size: sizeFromRatio(ratio),
        style,
        n: Math.min(4, Math.max(1, Number(count) || 1)),
        options: {
          quality, aspect_ratio: ratio,
          character_sync: true,
          character_name: charName.trim() || undefined,
        },
      }),
      onItemSuccess: (pose) => removePose(pose.draftId),
      onItemError: (pose, e) => {
        const msg = (e as any)?.response?.data?.detail?.message ?? "Submit lỗi";
        setLog((p) => [...p, { ts: nowTs(), level: "error", msg: `✗ Pose #${pose.draftId}: ${msg}` }]);
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
        title="Tạo ảnh đồng bộ (Image Sync)"
        subtitle={`Bộ ảnh cùng nhân vật, nhiều góc — ${jobs.length} ảnh · ${successCount} thành công · ${failedCount} lỗi`}
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
                <div className="text-[12px] text-violet-200 font-medium">Chọn nhân vật</div>
              </label>
            )}
          </div>
          <div className="md:col-span-2 space-y-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Tên nhân vật</div>
              <input value={charName} onChange={(e) => setCharName(e.target.value)}
                     placeholder="VD: Hana — model thời trang Á Đông"
                     className="cvp-input w-full" />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Mô tả ngoại hình & style</div>
              <textarea value={charDesc} onChange={(e) => setCharDesc(e.target.value)}
                        placeholder="VD: 23 tuổi, tóc nâu dài uốn nhẹ, son hồng nude, áo blouse trắng..."
                        rows={3}
                        className="cvp-input w-full resize-none text-[11px] leading-relaxed" />
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Preset góc/cảnh</div>
              <div className="flex flex-wrap gap-1.5">
                {POSE_PRESETS.map((p) => (
                  <button key={p} onClick={() => addPreset(p)}
                          className="text-[10px] px-2 py-1 rounded-md bg-violet-500/10 ring-1 ring-violet-400/20 text-violet-200 hover:bg-violet-500/20 hover:ring-violet-400/40 transition-colors">
                    + {p.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="cvp-card p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton icon={Plus} onClick={addPose}>Thêm Góc</ToolButton>
          <ToolButton icon={ImagePlus} onClick={() => importInputRef.current?.click()}>Import Poses</ToolButton>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={(e) => onImportPicked(e.target.files)}
          />
          <ToolButton icon={Eraser} onClick={() => setPoses([])}>Clear</ToolButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={Play} variant="primary" onClick={startBatch}
                      disabled={submitting || !refFileId || selected.size === 0}>
            Tạo Ảnh ({selected.size})
          </ToolButton>
          <ToolButton icon={Square} variant="danger" onClick={stopAll}>Dừng</ToolButton>
          <ToolButton icon={RotateCcw} onClick={retryFailed}>Retry</ToolButton>
          <div className="flex-1" />
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 px-2 py-1 rounded hover:bg-white/5">
            <input type="checkbox" className="accent-cyan-500"
                   checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} />
            Ẩn lỗi
          </label>
        </div>
      </div>

      <ImageSettingsRow ratio={ratio} setRatio={setRatio} quality={quality} setQuality={setQuality}
                        style={style} setStyle={setStyle} count={count} setCount={setCount} />
      <BatchPanel enabled={batchEnabled} setEnabled={setBatchEnabled}
                  size={batchSize} setSize={setBatchSize} delay={batchDelay} setDelay={setBatchDelay}
                  waitState={batch.waitState} />
      <FolderPicker folder={folder} onChange={setFolder} />

      {/* Pose drafts */}
      {poses.length > 0 && (
        <div className="cvp-card overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">
            Poses đang soạn ({poses.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 p-3">
            {poses.map((s) => (
              <div key={s.draftId} className="cvp-card p-2.5 space-y-2 ring-amber-400/20">
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="accent-violet-500"
                         checked={selected.has(s.draftId)} onChange={() => toggleSelect(s.draftId)} />
                  <span className="text-[10px] font-mono text-violet-400/70">#{String(s.draftId).padStart(2, "0")}</span>
                  <div className="flex-1" />
                  <button onClick={() => removePose(s.draftId)} className="text-rose-400 hover:text-rose-300">
                    <Trash2 size={10} />
                  </button>
                </div>
                <textarea value={s.text} onChange={(e) => updatePose(s.draftId, e.target.value)}
                          rows={3}
                          placeholder="Mô tả góc / pose / cảnh..."
                          className="cvp-input w-full resize-none text-[11px] leading-relaxed" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real job history as gallery */}
      <div className="cvp-card overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          Ảnh đã tạo ({jobs.length})
        </div>
        {isLoading && jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">Đang tải...</div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic flex flex-col items-center gap-2">
            <Camera size={32} className="text-slate-700" />
            Chưa có ảnh — upload nhân vật + chọn pose + Tạo Ảnh.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 p-3">
            {visibleJobs.map((j) => {
              const st = mapStatus(j.status);
              const ringCls = st === "success" ? "ring-emerald-400/30"
                            : st === "failed"  ? "ring-rose-400/30"
                            : st === "running" ? "ring-amber-400/30" : "";
              return (
                <div key={j.id} className={`cvp-card cvp-card-hover p-2.5 space-y-2 ${ringCls}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-violet-400/70">#{j.id.slice(0, 6)}</span>
                    <div className="flex-1" />
                    <StatusPill status={st} />
                  </div>
                  <div className="aspect-square rounded-md bg-black/40 ring-1 ring-white/5 grid place-items-center overflow-hidden">
                    {j.result_url
                      ? <AuthedImage url={j.result_url} className="w-full h-full object-cover" />
                      : <Camera size={28} className={st === "running" ? "text-amber-400/60 animate-pulse" : "text-slate-700"} />}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-relaxed line-clamp-2" title={j.prompt}>
                    {j.prompt}
                  </div>
                  <div className="flex gap-1.5">
                    {j.result_url && (
                      <>
                        <button onClick={() => setPreviewJob(j)}
                           className="cvp-btn-violet flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1">
                          <Eye size={10} /> Xem
                        </button>
                        <button onClick={() => downloadAuthed(j.result_url!, `sync-${j.id.slice(0, 8)}.png`)}
                           className="cvp-btn-teal flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1">
                          <Download size={10} />
                        </button>
                      </>
                    )}
                    {st === "running" && (
                      <button onClick={() => cancel.mutate(j.id)}
                              className="cvp-btn-ghost flex-1 inline-flex items-center justify-center text-[10px] px-2 py-1 text-amber-300">
                        <Square size={10} />
                      </button>
                    )}
                    {st === "failed" && (
                      <button onClick={() => retry.mutate(j.id)}
                              className="cvp-btn-ghost flex-1 inline-flex items-center justify-center text-[10px] px-2 py-1 text-cyan-300">
                        <RotateCcw size={10} />
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
          filename={`sync-${previewJob.id.slice(0, 8)}.png`}
          caption={previewJob.prompt}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </div>
  );
}
