import { Image as ImageIcon, Film, Globe } from "lucide-react";
import type { GalleryItem } from "../models/gallery";
import { useInView, VideoThumb } from "./GalleryHelpers";

export function GalleryMediaGrid({
  items, onPreview,
}: { items: GalleryItem[]; onPreview: (i: GalleryItem) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((item) => (
        <GalleryCell key={item.job_id} item={item} onClick={() => onPreview(item)} />
      ))}
    </div>
  );
}

function GalleryCell({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  const isVideo = item.job_type === "video";
  const { ref, inView } = useInView<HTMLButtonElement>("400px");
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="group relative rounded-xl overflow-hidden bg-slate-100 aspect-square ring-1 ring-slate-200 hover:ring-2 hover:ring-blue-400 hover:shadow-card-hover transition focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {!inView ? (
        // Cheap placeholder until the cell is near the viewport. Keeps
        // off-screen rows from spawning N HTTP requests on mount.
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
      ) : isVideo ? (
        <VideoThumb url={item.result_url} />
      ) : (
        <img
          src={item.result_url}
          alt={item.prompt.slice(0, 60)}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      )}
      <span
        className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
          isVideo ? "bg-accent-fuchsia/90 text-white" : "bg-brand-600/90 text-white"
        }`}
      >
        {isVideo ? <Film size={9} /> : <ImageIcon size={9} />}
        {isVideo ? "VIDEO" : "ẢNH"}
      </span>
      {item.domain_hostname && (
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-sm bg-black/50 text-white">
          <Globe size={8} /> {item.domain_brand_name || item.domain_hostname}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
        <p className="text-xs text-white line-clamp-2 leading-tight">{item.prompt}</p>
        {item.user_email && (
          <p className="text-[10px] text-white/80 mt-1 font-mono truncate">{item.user_email}</p>
        )}
      </div>
    </button>
  );
}
