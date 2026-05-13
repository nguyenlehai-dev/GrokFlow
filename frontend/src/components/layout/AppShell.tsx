import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";

import { useAuthStore, userCanSeePath } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import type { NavEntry, NavLeaf, NavGroup } from "@/app/types";
import { getAuthedNav } from "@/app/moduleRegistry";
import { useDocumentTitle } from "@/core/useDocumentTitle";

// Sidebar entries come from the module registry — each module owns its own
// nav. AppShell just filters by role/domain/feature and renders. The
// registry returns a different shape for super_admin (Grok/Flow/Gateway
// wrapped under a "Web" parent) so we resolve NAV at render time, not
// module load.

export function AppShell() {
  useDocumentTitle();
  const { user, clear } = useAuthStore();
  const NAV: NavEntry[] = useMemo(() => getAuthedNav(user?.role), [user?.role]);
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

  // Filter groups + their items by visibility. Drop empty groups. Recurses
  // through nested groups so the "Web" parent (super_admin only) — which
  // wraps the Grok/Flow/Gateway sub-groups — gets correctly stripped if
  // none of its children survive the visibility filter.
  const filterEntries = (entries: NavEntry[]): NavEntry[] =>
    entries.flatMap<NavEntry>((entry) => {
      if (entry.type === "link") {
        return canSeeLeaf(entry) ? [entry] : [];
      }
      if (entry.superOnly && !isSuper) return [];
      if (entry.adminOnly && !isAdmin) return [];
      const items = filterEntries(entry.items);
      if (items.length === 0) return [];
      return [{ ...entry, items }];
    });
  const visibleNav: NavEntry[] = filterEntries(NAV);

  // Mobile sidebar: hidden by default, slides in over the page when the
  // header hamburger is tapped. Auto-close on route change so the user
  // doesn't have to dismiss it after every nav.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const onLogout = () => {
    clear();
    navigate("/login");
  };

  return (
    <div className="flex h-screen">
      {/* Mobile backdrop — tap to dismiss. md+ never renders this. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={
          // Mobile: fixed off-canvas drawer toggled by `mobileOpen`.
          // md+: in-flow column with fixed width like before.
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white flex flex-col " +
          "transform transition-transform duration-200 md:static md:transform-none md:w-60 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <Link to="/dashboard" className="text-lg font-semibold text-brand-600 truncate">
            {brandName}
          </Link>
          {/* Close button visible only on mobile when drawer is open */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden -mr-1 p-1 text-slate-500 hover:text-slate-800"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
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

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-4 md:px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger — only on mobile (md hides). */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="text-xs sm:text-sm text-slate-500 min-w-0 truncate">
              {/* Hide the "Logged in as" prefix on the smallest screens to save space */}
              <span className="hidden sm:inline">Logged in as </span>
              <span className="font-medium text-slate-800">{user?.email}</span>
              <span className="hidden sm:inline"> ({user?.role})</span>
              {planName && (
                <span className="ml-2 hidden md:inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {planName}
                </span>
              )}
              {!isSuper && domainConfig?.hostname && (
                <span className="ml-2 hidden lg:inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  @{domainConfig.hostname}
                </span>
              )}
            </div>
          </div>
          <button onClick={onLogout} className="btn-ghost shrink-0">
            <LogOut size={16} className="sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </header>
        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
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

/** Walk a group's items (which may be leaves or nested groups) and check
 *  whether any leaf inside matches the active path. Used to decide whether
 *  the group auto-expands so the user lands on their current page already
 *  visible — works for both 1-level (Grok/Flow/Gateway) and 2-level
 *  (super_admin's "Web" → Flow → tools) hierarchies. */
function groupHasActiveLeaf(items: NavEntry[], currentPath: string): boolean {
  return items.some((it) => {
    if (it.type === "link") return currentPath.startsWith(it.to);
    return groupHasActiveLeaf(it.items, currentPath);
  });
}

function CollapsibleGroup({
  group, currentPath,
}: { group: NavGroup; currentPath: string }) {
  const Icon = group.icon;
  const hasActive = groupHasActiveLeaf(group.items, currentPath);
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
          {group.items.map((item) =>
            item.type === "link" ? (
              <LeafLink key={item.to} item={item} />
            ) : (
              // Nested group — recurse. Used by super_admin's "Web" wrapper
              // around Grok/Flow/Gateway. Indent steps via the parent's
              // `ml-3 pl-3 border-l` so each level visually nests further.
              <CollapsibleGroup
                key={item.key}
                group={item}
                currentPath={currentPath}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
