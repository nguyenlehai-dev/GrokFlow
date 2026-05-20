import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, type LucideIcon } from "lucide-react";

export interface AuthArtBullet {
  icon?: LucideIcon | null;
  text: string;
}

interface AuthArtPanelProps {
  brandName: string;
  eyebrow?: string;
  headline: ReactNode;
  subtitle: string;
  bullets: AuthArtBullet[];
  blobs: ReactNode;
  gradientClass?: string;
  copyrightSuffix?: string; // optional trailing text after © year brand (e.g. "All rights reserved.")
}

// Left "art" half of the auth pages. Hidden on mobile, shows brand identity
// + a pitch (feature highlights or free-trial sell). Login and Register
// share this scaffold; per-page content flows in via props.
export function AuthArtPanel({
  brandName,
  eyebrow,
  headline,
  subtitle,
  bullets,
  blobs,
  gradientClass = "bg-gradient-brand",
  copyrightSuffix,
}: AuthArtPanelProps) {
  return (
    <div className={`hidden lg:flex lg:w-1/2 relative overflow-hidden ${gradientClass}`}>
      {/* Decorative orbs — positions vary per page */}
      {blobs}

      <div className="relative z-10 flex flex-col justify-between p-12 text-white">
        <Link to="/" className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center font-bold text-xl">
            {brandName[0]}
          </span>
          <span className="font-bold text-2xl">{brandName}</span>
        </Link>

        <div className="space-y-8">
          <div>
            {eyebrow && (
              <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-semibold tracking-wider uppercase">
                {eyebrow}
              </span>
            )}
            <h2 className={`${eyebrow ? "mt-4 " : ""}text-4xl font-bold leading-tight`}>
              {headline}
            </h2>
            <p className="mt-4 text-white/80 text-lg max-w-md">{subtitle}</p>
          </div>

          <ul className="space-y-3">
            {bullets.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                {Icon ? (
                  <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Icon size={16} />
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </span>
                )}
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">
          © {new Date().getFullYear()} {brandName}.{copyrightSuffix ? ` ${copyrightSuffix}` : ""}
        </p>
      </div>
    </div>
  );
}
