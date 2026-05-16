import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown, Globe, Menu, X,
  Image as ImageIcon, Film,
  Sparkles, Bot, Cpu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { setLocale } from "@/core/i18n";
import { NexoratechLogo } from "./NexoratechLogo";

interface Props {
  brandName?: string;
}

interface NavItem {
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  disabled?: boolean;
}

/** Information architecture for the public nav.
 *
 *  Organised by *capability* (Image / Video) rather than module name so
 *  visitors discover features by what they want to make, not by which
 *  backend service serves them. Each item maps to a vendor we route to
 *  via Gateway or a direct Grok automation.
 *
 *  `Tool` ships in a follow-up — kept in the IA so users know it's
 *  coming, but disabled until the backend lands.
 */
const NAV_ITEMS: NavGroup[] = [
  {
    key: "image",
    label: "Image",
    items: [
      {
        label: "Grok Image",
        description: "Sinh ảnh từ tài khoản Grok thật — không tính token",
        icon: Sparkles,
      },
      {
        label: "Gemini Image",
        description: "Imagen 3 / Nano Banana qua Gateway",
        icon: Bot,
      },
      {
        label: "GPT Image",
        description: "DALL·E 3 + gpt-image-1 (OpenAI)",
        icon: Cpu,
      },
    ],
  },
  {
    key: "video",
    label: "Video",
    items: [
      {
        label: "Grok Video",
        description: "Sinh video qua tài khoản Grok thật",
        icon: Sparkles,
      },
      {
        label: "Gemini Video",
        description: "Veo 3 — chất lượng cinematic, tốc độ cao",
        icon: Bot,
      },
      {
        label: "GPT Video",
        description: "Sora — text-to-video / extend / remix",
        icon: Cpu,
      },
    ],
  },
  {
    key: "tool",
    label: "Tool",
    items: [],
    disabled: true,
  },
];

// Icon shown next to the group label in the trigger button.
const GROUP_ICON: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Film,
};

export function TopBar({ brandName = "Nexoratech" }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);          // mobile drawer
  const [openKey, setOpenKey] = useState<string | null>(null);  // desktop dropdown
  const navRef = useRef<HTMLDivElement | null>(null);
  const otherLang = i18n.language?.startsWith("en") ? "vi" : "en";
  const langLabel = i18n.language?.startsWith("en") ? "English" : "Tiếng Việt";

  // Click outside the desktop nav strip closes the open panel. Mouse-leave
  // alone is too aggressive (any travel between trigger and panel closes
  // it); click-outside matches OS-level menu behavior.
  useEffect(() => {
    if (!openKey) return;
    const onDocClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenKey(null);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openKey]);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/70 bg-slate-50/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <NexoratechLogo size={28} className="sm:hidden" />
          <NexoratechLogo size={32} className="hidden sm:block" />
          <span className="text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
            {brandName}
          </span>
        </Link>

        {/* Desktop nav — click-driven dropdowns (hover would close too
         *  eagerly when the mouse leaves the trigger to reach the panel). */}
        <nav ref={navRef} className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((g) => {
            const isOpen = openKey === g.key;
            const GroupIcon = GROUP_ICON[g.key];

            if (g.disabled) {
              return (
                <span
                  key={g.key}
                  aria-disabled="true"
                  title="Sắp có"
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-300"
                >
                  {g.label}
                  <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    Soon
                  </span>
                </span>
              );
            }
            return (
              <div key={g.key} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey((cur) => (cur === g.key ? null : g.key))}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                    isOpen
                      ? "bg-slate-100 text-slate-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {GroupIcon && <GroupIcon size={14} className="opacity-70" />}
                  {g.label}
                  <ChevronDown
                    size={14}
                    className={`opacity-60 transition ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl"
                  >
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {g.label} models
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Tất cả vendor được route qua Gateway — không cần đổi API key.
                      </p>
                    </div>
                    <ul className="p-2">
                      {g.items.map((it) => {
                        const Icon = it.icon;
                        return (
                          <li key={it.label}>
                            <a
                              href="#"
                              role="menuitem"
                              onClick={() => setOpenKey(null)}
                              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50"
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                                <Icon size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-slate-800">
                                  {it.label}
                                  {it.badge && (
                                    <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                                      {it.badge}
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                                  {it.description}
                                </span>
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setLocale(otherLang)}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            title="Toggle language"
          >
            <Globe size={14} /> {langLabel}
          </button>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden text-sm font-medium text-blue-600 hover:text-blue-700 sm:inline-block"
          >
            {t("auth.login_submit")}
          </Link>
          <Link
            to="/register"
            className="hidden rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex"
          >
            {t("landing.cta_start")}
          </Link>

          {/* Hamburger (mobile only) */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-slate-200/70 bg-slate-50 md:hidden">
          <div className="space-y-4 px-4 py-5">
            {NAV_ITEMS.map((g) => {
              const GroupIcon = GROUP_ICON[g.key];
              if (g.disabled) {
                return (
                  <div
                    key={g.key}
                    aria-disabled="true"
                    className="flex items-center justify-between rounded-md bg-white px-4 py-3 text-sm font-semibold text-slate-300 shadow-sm"
                  >
                    <span>{g.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Soon
                    </span>
                  </div>
                );
              }
              return (
                <details key={g.key} className="group rounded-md bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      {GroupIcon && <GroupIcon size={14} className="text-slate-500" />}
                      {g.label}
                    </span>
                    <ChevronDown size={14} className="text-slate-400 transition group-open:rotate-180" />
                  </summary>
                  <ul className="border-t border-slate-100 p-2">
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      return (
                        <li key={it.label}>
                          <a
                            href="#"
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-slate-50"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                              <Icon size={14} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-slate-800">{it.label}</span>
                              <span className="block text-xs leading-snug text-slate-500">{it.description}</span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}

            <button
              onClick={() => setLocale(otherLang)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-white py-2.5 text-sm font-medium text-slate-700 shadow-sm"
            >
              <Globe size={14} /> {langLabel}
            </button>

            <div className="flex gap-2 pt-1">
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-blue-600 py-2.5 text-center text-sm font-semibold text-blue-600"
              >
                {t("auth.login_submit")}
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md bg-blue-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm"
              >
                {t("landing.cta_start")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
