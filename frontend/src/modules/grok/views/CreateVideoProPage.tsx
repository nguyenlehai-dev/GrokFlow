import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Menu, Settings as Cog,
  Type as TypeIcon, Image as ImageIcon, Users, Camera, Aperture, LogIn,
  ArrowLeft, LogOut, Sparkles, Zap,
} from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { TextToVideoPanel } from "./cvp-panels/TextToVideoPanel";
import { ImageToVideoPanel } from "./cvp-panels/ImageToVideoPanel";
import { CharacterSyncPanel } from "./cvp-panels/CharacterSyncPanel";
import { ImageSyncPanel } from "./cvp-panels/ImageSyncPanel";
import { ImageDirectPanel } from "./cvp-panels/ImageDirectPanel";
import { AutoLoginPanel } from "./cvp-panels/AutoLoginPanel";
import { QuotaPill } from "./cvp-panels/QuotaPill";
import { PanelErrorBoundary } from "./cvp-panels/PanelErrorBoundary";

/** "Create Video Pro" — Tech Studio premium workspace for batch AI
 *  video/image generation. Lives at /create-video-pro (top-level route,
 *  outside AppShell), targeting both desktop kiosk users (tool-scoped
 *  accounts) and admins previewing the customer surface.
 *
 *  Routing strategy: NO react-router child routes — this page owns its
 *  own internal navigation via `activeKey` so the dark workspace stays
 *  a single SPA shell (no URL flicker between tools). For deep-linking
 *  individual tools later, we can lift this state into a hash router.
 *
 *  Design system: `_create_video_pro.scss` (cvp-* utility classes).
 *  Theme philosophy: glass + neon-accent + semantic motion. Content is
 *  the visual protagonist; chrome stays muted. */

type ToolKey =
  | "text_to_video"
  | "image_to_video"
  | "character_sync"
  | "image_sync"
  | "image_direct"
  | "auto_login";

interface SidebarItem {
  key: ToolKey;
  label: string;
  icon: typeof TypeIcon;
  group: string;
  badge?: string;
  /** Virtual route used for permission gating in TOOL_PAGE_GROUPS.
   *  An admin that grants the parent `/create-video-pro` gets ALL panels
   *  (prefix-match). Granting individual child paths restricts the kiosk
   *  to a subset — useful when a customer pays for a specific feature
   *  bundle. */
  path: string;
}

const TOOLS: SidebarItem[] = [
  { key: "text_to_video",  label: "Text → Video Pro",   icon: TypeIcon,  group: "GROK AI", badge: "PRO", path: "/create-video-pro/text-to-video"  },
  { key: "image_to_video", label: "Image → Video",      icon: ImageIcon, group: "GROK AI",               path: "/create-video-pro/image-to-video" },
  { key: "character_sync", label: "Đồng bộ nhân vật",   icon: Users,     group: "GROK AI",               path: "/create-video-pro/character-sync" },
  { key: "image_sync",     label: "Tạo ảnh đồng bộ",    icon: Aperture,  group: "GROK AI",               path: "/create-video-pro/image-sync"     },
  { key: "image_direct",   label: "Tạo ảnh trực tiếp",  icon: Camera,    group: "GROK AI",               path: "/create-video-pro/image-direct"   },
  { key: "auto_login",     label: "Grok Auto Login",    icon: LogIn,     group: "GROK AI",               path: "/create-video-pro/auto-login"     },
];

const PANELS: Record<ToolKey, () => JSX.Element> = {
  text_to_video:  TextToVideoPanel,
  image_to_video: ImageToVideoPanel,
  character_sync: CharacterSyncPanel,
  image_sync:     ImageSyncPanel,
  image_direct:   ImageDirectPanel,
  auto_login:     AutoLoginPanel,
};

export function CreateVideoProPage() {
  const [activeKey, setActiveKey] = useState<ToolKey>("text_to_video");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isPageAllowed = useDomainStore((s) => s.isPageAllowed);

  // Filter panels by the tool install's allowed_pages list. Admin grants
  // either the parent `/create-video-pro` (= all panels) or specific child
  // paths (= restricted subset). `isPageAllowed` already prefix-matches
  // the parent, so granting only the parent unlocks every TOOLS entry.
  const visibleTools = useMemo(
    () => TOOLS.filter((t) => isPageAllowed(t.path)),
    [isPageAllowed],
  );

  // If admin revokes the currently active panel (or initial activeKey
  // isn't in the allowed set), bounce to the first visible panel.
  useEffect(() => {
    if (visibleTools.length === 0) return;
    if (!visibleTools.some((t) => t.key === activeKey)) {
      setActiveKey(visibleTools[0].key);
    }
  }, [visibleTools, activeKey]);

  const ActivePanel = PANELS[activeKey];

  return (
    // h-screen + overflow-hidden trên outer = "viewport-frame" cố định.
    // Cả 3 vùng (sidebar, header, content) chia nhau viewport, chỉ
    // content được phép scroll. Trước đó dùng min-h-screen → cả trang
    // scroll, sidebar + header trôi theo nội dung khi cuộn xuống.
    //
    // CSS var --cvp-main-left expose sidebar width (16rem khi mở, 0 khi
    // đóng) để PreviewModal có thể "nằm trong main" thay vì che cả app.
    <div
      className="h-screen overflow-hidden cvp-skin flex"
      style={{ "--cvp-main-left": sidebarOpen ? "16rem" : "0px" } as React.CSSProperties}
    >
      {sidebarOpen && (
        <ToolSidebar
          tools={visibleTools}
          activeKey={activeKey}
          onSelect={setActiveKey}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          sidebarOpen={sidebarOpen}
        />

        <div className="flex-1 cvp-panel-border p-4 sm:p-5 overflow-y-auto">
          {visibleTools.length === 0 ? (
            <NoPanelsAccess />
          ) : (
            <PanelErrorBoundary key={activeKey} name={activeKey}>
              <ActivePanel />
            </PanelErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

function NoPanelsAccess() {
  return (
    <div className="h-full grid place-items-center">
      <div className="cvp-card p-8 max-w-md text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 grid place-items-center">
          <Zap size={20} className="text-rose-300" />
        </div>
        <div className="text-[14px] font-bold text-slate-200">Chưa được cấp panel nào</div>
        <div className="text-[12px] text-slate-400 leading-relaxed">
          Máy này chưa được admin cấp quyền truy cập panel nào trong Create Video Pro.
          Liên hệ admin để được mở quyền.
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

function ToolSidebar({
  tools, activeKey, onSelect,
}: {
  tools: SidebarItem[];
  activeKey: ToolKey;
  onSelect: (k: ToolKey) => void;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, SidebarItem[]> = {};
    for (const t of tools) (groups[t.group] ??= []).push(t);
    return groups;
  }, [tools]);

  return (
    <aside className="w-64 shrink-0 cvp-sidebar px-3 py-4 space-y-4 h-full overflow-y-auto">
      <header className="flex items-center gap-2 px-2 pb-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg grid place-items-center"
             style={{
               background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
               boxShadow: "0 0 12px rgba(6, 182, 212, 0.4)",
             }}>
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="cvp-brand text-[13px] leading-tight">
            CREATE VIDEO PRO
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">
            AI Studio
          </div>
        </div>
      </header>

      {Object.entries(grouped).map(([groupName, items]) => (
        <section key={groupName}>
          <div className="cvp-group-label">
            <Zap size={9} /> {groupName}
          </div>
          <ul className="space-y-1">
            {items.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeKey;
              return (
                <li key={t.key}>
                  <button
                    onClick={() => onSelect(t.key)}
                    className={`cvp-nav-item ${active ? "is-active" : ""}`}
                  >
                    <Icon size={14} className={active ? "text-cyan-300" : ""} />
                    <span className="flex-1 text-left truncate">{t.label}</span>
                    {t.badge && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                              color: "white",
                              boxShadow: "0 0 8px rgba(6, 182, 212, 0.4)",
                            }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

// ─── Top bar ───────────────────────────────────────────────────────────────

function TopBar({
  onToggleSidebar, sidebarOpen,
}: { onToggleSidebar: () => void; sidebarOpen: boolean }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const isToolUser = !!user?.tool_install_id;
  return (
    <header className="cvp-topbar flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-slate-400 hover:text-cyan-300 transition-colors p-1.5 rounded-md hover:bg-white/5"
        >
          <Menu size={16} />
        </button>
        {!sidebarOpen && (
          <span className="cvp-brand text-[13px] font-bold tracking-widest">
            CREATE VIDEO PRO
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <QuotaPill />
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 ring-1 ring-white/10">
          <div className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white"
               style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
            {(user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <span className="text-[11px] text-slate-300 max-w-[160px] truncate">
            {user?.email}
          </span>
        </div>
        {!isToolUser && (
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
            title="Quay lại trang admin"
          >
            <ArrowLeft size={12} /> Quay lại web
          </Link>
        )}
        <button
          onClick={() => { clear(); window.location.href = "/login"; }}
          className="inline-flex items-center gap-1 text-[11px] text-rose-400/80 hover:text-rose-300 transition-colors"
          title="Đăng xuất"
        >
          <LogOut size={12} /> Logout
        </button>
        <button
          type="button"
          onClick={() => {
            // Cố tình dùng useNavigate + fallback window.location vì:
            // (1) <Link> trước đó "chóp chóp" — navigate firing nhưng
            //     route guard hoặc Electron sandbox can thiệp.
            // (2) Nếu React Router fail (vd HashRouter mismatch trong
            //     Electron file:// load), window.location đảm bảo
            //     navigation luôn xảy ra.
            try {
              navigate("/account");
            } catch {
              window.location.href = "/account";
            }
          }}
          className="text-slate-400 hover:text-cyan-300 transition-colors p-1.5 rounded-md hover:bg-white/5"
          title="Tài khoản — đổi thông tin / mật khẩu"
        >
          <Cog size={16} />
        </button>
      </div>
    </header>
  );
}

export default CreateVideoProPage;
