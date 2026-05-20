import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

/** Render `<img>` / `<video>` only once the element enters the viewport.
 *  Even though browsers honor `loading="lazy"` on <img>, the lazy heuristic
 *  is generous — it eagerly fetches anything within ~3 screens of the
 *  viewport, which is still 50+ thumbnails on a long gallery. Wrapping
 *  with IntersectionObserver gives us a fixed `rootMargin` so we only
 *  pay for what's actually about to be seen. */
export function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}

export function VideoThumb({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-fuchsia-100 to-rose-100">
          <Film size={28} className="text-fuchsia-400" />
        </div>
      )}
      <video
        ref={ref}
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        onLoadedData={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center group-hover:bg-white/50 transition">
          <div className="border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-1" />
        </div>
      </div>
    </>
  );
}
