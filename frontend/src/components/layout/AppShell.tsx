import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Key, Layers, FileText, Settings, LayoutDashboard, Workflow, LogOut, Shield,
  ScrollText, CreditCard, ChevronDown, Globe, Video, GitBranch, Scissors,
  Combine, AudioLines, Replace, Gauge, Maximize2, Crop, Film, Network,
  Boxes, Code2, Activity, Terminal, BookOpen, UserCog, Wrench, Sparkles,
} from "lucide-react";
import type { ComponentType } from "react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { FEATURE_KEYS } from "@/core/entitlements/catalog";

// `feature` — gate by user entitlement (admins bypass).
// `adminOnly` — only admins see it.
type IconType = ComponentType<{ size?: number; className?: string }>;

interface NavLeaf {
  type: "link";
  to: string;
  label: string;
  icon: IconType;
  feature?: string;
  adminOnly?: boolean;
}

interface NavGroup {
  type: "group";
  key: string;
  label: string;
  icon: IconType;
  adminOnly?: boolean;
  items: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

const NAV: NavEntry[] = [
  { type: "link", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", to: "/api-keys",  label: "API Keys",  icon: Key },

  {
    type: "group", key: "grok", label: "Quản lý Grok", icon: Sparkles,
    items: [
      { type: "link", to: "/profiles", label: "Profiles", icon: Layers },
      { type: "link", to: "/jobs",     label: "Jobs",     icon: Workflow },
      { type: "link", to: "/api-docs", label: "API Docs", icon: FileText, feature: FEATURE_KEYS.uiApiDocs },
    ],
  },

  {
    type: "group", key: "flow", label: "Quản lý Flow", icon: Video,
    items: [
      { type: "link", to: "/flow/cut",               label: "Cut Video",         icon: Scissors },
      { type: "link", to: "/flow/merge",             label: "Merge Videos",      icon: Combine },
      { type: "link", to: "/flow/extract-audio",     label: "Extract Audio",     icon: AudioLines },
      { type: "link", to: "/flow/replace-audio",     label: "Merge/Replace Audio", icon: Replace },
      { type: "link", to: "/flow/change-speed",      label: "Change Speed",      icon: Gauge },
      { type: "link", to: "/flow/resize",            label: "Resize",            icon: Maximize2 },
      { type: "link", to: "/flow/crop",              label: "Crop Video",        icon: Crop },
      { type: "link", to: "/flow/extract-frames",    label: "Extract Frames",    icon: Film },
      { type: "link", to: "/flow/docs",              label: "API Docs",          icon: FileText },
    ],
  },

  {
    type: "group", key: "gateway", label: "Gateway Management", icon: Network,
    items: [
      { type: "link", to: "/gateway/vendors",    label: "Vendor",        icon: Boxes },
      { type: "link", to: "/gateway/pools",      label: "Pools",         icon: GitBranch },
      { type: "link", to: "/gateway/functions",  label: "API Functions", icon: Code2 },
      { type: "link", to: "/gateway/requests",   label: "Requests",      icon: Activity },
      { type: "link", to: "/gateway/playground", label: "Playground",    icon: Terminal },
      { type: "link", to: "/gateway/docs",       label: "API Docs",      icon: BookOpen },
    ],
  },

  { type: "link", to: "/billing",     label: "Billing",     icon: CreditCard },
  { type: "link", to: "/audit-logs",  label: "Audit Log",   icon: ScrollText, feature: FEATURE_KEYS.uiAuditLog, adminOnly: true },

  {
    type: "group", key: "auth", label: "Auth", icon: Shield, adminOnly: true,
    items: [
      { type: "link", to: "/settings",      label: "Setting",     icon: Settings, feature: FEATURE_KEYS.uiSettings },
      { type: "link", to: "/admin/users",   label: "Admin",       icon: UserCog },
      { type: "link", to: "/admin/domains", label: "Domains",     icon: Globe },
      { type: "link", to: "/admin/billing", label: "Billing",     icon: CreditCard },
      { type: "link", to: "/admin/plans",   label: "Plans / Gói", icon: Wrench },
    ],
  },
];

export function AppShell() {
  const { user, clear } = useAuthStore();
  const domainConfig = useDomainStore((s) => s.config);
  const isPageAllowed = useDomainStore((s) => s.isPageAllowed);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const features = user?.entitlements?.features ?? {};
  const brandName = domainConfig?.brand_name ?? "GrokFlow";
  const planName = user?.entitlements?.plan_name;

  const canSeeLeaf = (n: NavLeaf): boolean => {
    if (n.adminOnly && !isAdmin) return false;
    if (n.feature && !isAdmin && !features[n.feature]) return false;
    if (!isAdmin && !isPageAllowed(n.to)) return false;
    return true;
  };

  // Filter groups + their items by visibility. Drop empty groups.
  const visibleNav: NavEntry[] = NAV.flatMap((entry) => {
    if (entry.type === "link") {
      return canSeeLeaf(entry) ? [entry] : [];
    }
    if (entry.adminOnly && !isAdmin) return [];
    const items = entry.items.filter(canSeeLeaf);
    if (items.length === 0) return [];
    return [{ ...entry, items }];
  });

  const onLogout = () => {
    clear();
    navigate("/login");
  };

  return (
    <div className="flex h-screen">
      <aside className="w-60 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <Link to="/dashboard" className="text-lg font-semibold text-brand-600">
            {brandName}
          </Link>
        </div>
        <nav className="p-2 flex-1 overflow-y-auto">
          {visibleNav.map((entry) =>
            entry.type === "link" ? (
              <LeafLink key={entry.to} item={entry} />
            ) : (
              <CollapsibleGroup
                key={entry.key}
                group={entry}
                currentPath={location.pathname}
              />
            )
          )}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">
            Logged in as <span className="font-medium text-slate-800">{user?.email}</span> ({user?.role})
            {planName && (
              <span className="ml-2 inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {planName}
              </span>
            )}
          </div>
          <button onClick={onLogout} className="btn-ghost"><LogOut size={16} className="mr-2" />Logout</button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LeafLink({ item }: { item: NavLeaf }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
        }`
      }
    >
      <Icon size={16} />
      {item.label}
    </NavLink>
  );
}

function CollapsibleGroup({
  group, currentPath,
}: { group: NavGroup; currentPath: string }) {
  const Icon = group.icon;
  // Auto-expand the group whose item is currently active so the user lands
  // with their place visible. Otherwise default to collapsed for compactness.
  const hasActive = group.items.some((it) => currentPath.startsWith(it.to));
  const [open, setOpen] = useState(hasActive);

  // Keep in sync if the route changes from elsewhere (e.g. programmatic nav).
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          hasActive ? "text-brand-700" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        <Icon size={16} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-slate-200 mt-0.5">
          {group.items.map((item) => (
            <LeafLink key={item.to} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
