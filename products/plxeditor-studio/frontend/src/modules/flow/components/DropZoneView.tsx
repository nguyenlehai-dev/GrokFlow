import { useRef, useState } from "react";
import type { DropZone } from "../configs/tools";
import { ZoneIcon } from "./ZoneIcon";

interface DropZoneViewProps {
  zone: DropZone;
  files: File[];
  onFiles: (files: File[]) => void;
}

// Drag-and-drop + click-to-pick file zone. Pure presentation — the parent
// owns the file array (so it can mix primary/secondary inputs).
export function DropZoneView({ zone, files, onFiles }: DropZoneViewProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    onFiles(Array.from(incoming));
  };

  return (
    <div className="space-y-2">
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-12 text-center transition",
          dragOver
            ? "border-violet-500 bg-violet-50"
            : "border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/40",
        ].join(" ")}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-inner ring-1 ring-slate-200">
          <ZoneIcon icon={zone.icon} />
        </div>
        <p className="mt-4 text-lg font-semibold text-white">{zone.label}</p>
        {zone.hint && <p className="mt-1 text-sm text-slate-500">{zone.hint}</p>}
        <input
          ref={ref}
          type="file"
          accept={zone.accept}
          multiple={zone.multiple}
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1 px-1 text-[11px] text-slate-500">
          {files.map((f, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
