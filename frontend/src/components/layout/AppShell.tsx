import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";

import { useAuthStore, userCanSeePath } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import type { NavEntry, NavLeaf, NavGroup } from "@/app/types";
import { useTranslation } from "react-i18next";

import { getAuthedNav } from "@/app/moduleRegistry";
import { useDocumentTitle } from "@/core/useDocumentTitle";
import { NotificationBell } from "./NotificationBell";
import { QuickCreateMenu } from "./QuickCreateMenu";

/** Map nav-group key → i18n key under "nav.<x>". Falls back to the static
 *  label if there's no translation key (e.g. for module-specific items
 *  that haven't been wrapped yet). Wrapping more nav entries is a one-line
 *  addition in vi.ts/en.ts + this map. */
const NAV_KEY_I18N: Record<string, string> = {
  auth: "nav.auth",
  web: "nav.web",
  grok: "nav.grok",
  flow: "nav.flow",
  gateway: "nav.gateway",
};

// Sidebar entries come from the module registry — each module owns its own
// nav. AppShell just filters by role/domain/feature and renders. The
// registry returns a different shape for super_admin (Grok/Flow/Gateway
// wrapped under a "Web" parent) so we resolve NAV at render time, not
// module load.

export function AppShell() {
  useDocumentTitle();
  const { user, clear } = useAuthStore();
  const NAV: NavEntry[] = useMemo(() => getAuthedNav(user?.role), [user?.role]);

  // Sync i18next with the user's saved locale once /me has populated.
  // Doing it here (not in main.tsx) means the LanguageDetector default
  // applies for unauthed pages, then this kicks in after login.
  useEffect(() => {
    if (user?.locale) {
      void import("@/core/i18n").then((m) => m.setLocale(user.locale!));
    }
  }, [user?.locale]);
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
    <div className="flex h-screen bg-ink-50">
      {/* Mobile backdrop — tap to dismiss. md+ never renders this. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={
          // Mobile: fixed off-canvas drawer. md+: in-flow column.
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-200/70 " +
          "bg-white flex flex-col " +
          "transform transition-transform duration-200 md:static md:transform-none md:w-64 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="px-5 py-5 border-b border-ink-100 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0 group">
            {/* Brand logo mark — gradient square with the brand initial. */}
            <span className="w-9 h-9 rounded-xl bg-gradient-brand text-white flex items-center justify-center font-bold text-base shadow-brand shrink-0">
              {(brandName?.[0] ?? "G").toUpperCase()}
            </span>
            <span className="font-bold text-lg text-ink-900 truncate group-hover:text-gradient transition-all">
              {brandName}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden -mr-1 p-1.5 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto space-y-0.5">
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
        {/* Sidebar footer: plan badge + user identity, lifted off the nav list */}
        {user && (
          <div className="border-t border-ink-100 p-3 space-y-2">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-accent-fuchsia/20 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
                {(user.email?.[0] ?? "U").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-900 truncate">{user.email}</p>
                <p className="text-[10px] text-ink-500 uppercase tracking-wider">{user.role}</p>
              </div>
            </div>
            {planName && (
              <div className="px-2">
                <span className="badge-brand text-[10px]">
                  ✦ {planName}
                </span>
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="sticky top-0 z-20 glass border-b border-ink-200/60 px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-1 text-ink-600 hover:text-ink-900 rounded-lg hover:bg-ink-100"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            {!isSuper && domainConfig?.hostname && (
              <span className="hidden lg:inline-flex badge-slate font-mono">
                @{domainConfig.hostname}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <QuickCreateMenu />
            <NotificationBell />
            <button onClick={onLogout} className="btn-ghost btn-sm" aria-label="Logout">
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-5 md:p-7 animate-fade-in">
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
        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-gradient-to-r from-brand-50 to-accent-fuchsia/10 text-brand-700 shadow-sm"
            : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-brand" />
          )}
          <Icon size={16} className={isActive ? "text-brand-600" : ""} />
          <span className="truncate">{item.label}</span>
        </>
      )}
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
  const { t } = useTranslation();
  const Icon = group.icon;
  const hasActive = groupHasActiveLeaf(group.items, currentPath);
  const [open, setOpen] = useState(hasActive);
  const i18nKey = NAV_KEY_I18N[group.key];
  // i18nKey present → translate; else fall through to the static label.
  const label = i18nKey ? t(i18nKey, group.label) : group.label;

  // Keep in sync if the route changes from elsewhere (e.g. programmatic nav).
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          hasActive
            ? "text-brand-700 bg-brand-50/60"
            : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
        }`}
      >
        <Icon size={16} className={hasActive ? "text-brand-600" : ""} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="ml-3.5 pl-3 border-l-2 border-ink-100 mt-1 space-y-0.5 animate-slide-up">
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
