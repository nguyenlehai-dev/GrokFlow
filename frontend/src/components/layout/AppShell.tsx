import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";

import { useAuthStore, userCanSeePath } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import type { NavEntry, NavLeaf, NavGroup } from "@/app/types";
import { getAuthedNav } from "@/app/moduleRegistry";

// Sidebar entries come from the module registry — each module owns its own
// nav. AppShell just filters by role/domain/feature and renders.
const NAV: NavEntry[] = getAuthedNav();

export function AppShell() {
  const { user, clear } = useAuthStore();
  const domainConfig = useDomainStore((s) => s.config);
  const isPageAllowed = useDomainStore((s) => s.isPageAllowed);
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user?.role === "super_admin";
  const isAdmin = isSuper || user?.role === "admin";
  const features = user?.entitlements?.features ?? {};
  const brandName = domainConfig?.brand_name ?? "GrokFlow";
  const planName = user?.entitlements?.plan_name;

  const canSeeLeaf = (n: NavLeaf): boolean => {
    if (n.superOnly && !isSuper) return false;
    if (n.adminOnly && !isAdmin) return false;
    if (n.feature && !isAdmin && !features[n.feature]) return false;
    // Path-level check. userCanSeePath understands tier rules:
    //   super_admin  → always true
    //   admin        → /admin/{users,roles} always; otherwise must be in
    //                  the domain's allowed pages
    //   user/support → must be in role ∩ domain
    return userCanSeePath(user ?? null, n.to, isPageAllowed);
  };

  // Filter groups + their items by visibility. Drop empty groups.
  const visibleNav: NavEntry[] = NAV.flatMap<NavEntry>((entry) => {
    if (entry.type === "link") {
      return canSeeLeaf(entry) ? [entry] : [];
    }
    if (entry.superOnly && !isSuper) return [];
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
            {!isSuper && domainConfig?.hostname && (
              <span className="ml-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                @{domainConfig.hostname}
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
