import { Music, FileVideo, Video as VideoIcon } from "lucide-react";
import type { DropZone } from "../configs/tools";

// Tiny icon switcher for the drop-zone hero glyph. Centralized so the icon
// vocabulary stays in one place — adding a new DropZone.icon variant only
// touches this file.
export function ZoneIcon({ icon }: { icon: DropZone["icon"] }) {
  const cls = "h-7 w-7 text-slate-500";
  if (icon === "audio") return <Music className={cls} />;
  if (icon === "media") return <FileVideo className={cls} />;
  return <VideoIcon className={cls} />;
}
