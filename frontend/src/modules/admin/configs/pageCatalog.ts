// Catalog of all authed routes admin can grant per-domain / per-role.
// Grouped by parent menu (matches the sidebar in AppShell) so the admin
// UI can render group-level "Select all" toggles instead of a flat soup
// of checkboxes. Keep in sync with router.tsx + AppShell.tsx.
//
// Used by:
//   - AdminRolesPage / AdminDomainsTab — render the page-allowlist UI.
//   - useDocumentTitle — map a route prefix to its human-readable page
//     name for the browser tab title.

export interface PageDef {
  path: string;
  label: string;
  /** When true, only super_admin sees the toggle for this page in the UI.
   *  Granting these to a domain admin role still works (backend doesn't
   *  validate), but the UI marks them so admins don't accidentally hand out
   *  global-CRUD pages that 403 for non-super users. */
  adminOnly?: boolean;
}

export interface PageGroup {
  /** Sidebar group key — matches the NavGroup.key in AppShell. */
  key: string;
  label: string;
  /** When true, the whole group only makes sense for super_admin. */
  superOnly?: boolean;
  items: PageDef[];
}

export const PAGE_GROUPS: PageGroup[] = [
  {
    key: "core",
    label: "Core",
    items: [
      { path: "/dashboard", label: "Dashboard" },
      { path: "/api-keys", label: "API Keys" },
      { path: "/billing", label: "Billing" },
      { path: "/pricing", label: "Pricing" },
      { path: "/checkout", label: "Checkout" },
      { path: "/audit-logs", label: "Audit Log" },
      { path: "/settings", label: "Settings" },
    ],
  },
  {
    key: "admin",
    label: "Admin tools",
    superOnly: true,
    items: [
      { path: "/admin", label: "Admin · Hub", adminOnly: true },
      { path: "/admin/users", label: "Admin · Users", adminOnly: true },
      { path: "/admin/roles", label: "Admin · Roles", adminOnly: true },
      { path: "/admin/domains", label: "Admin · Domains", adminOnly: true },
      { path: "/admin/plans", label: "Admin · Plans", adminOnly: true },
      { path: "/admin/billing", label: "Admin · Billing", adminOnly: true },
      { path: "/admin/git", label: "Admin · Git / Deploy", adminOnly: true },
    ],
  },
  {
    key: "grok",
    label: "Quản lý Grok",
    items: [
      { path: "/profiles", label: "Grok · Profiles" },
      { path: "/jobs", label: "Grok · Jobs" },
      { path: "/grok/playground", label: "Grok · Playground" },
      { path: "/api-docs", label: "Grok · API Docs" },
    ],
  },
  {
    key: "flow",
    label: "Quản lý Flow",
    items: [
      // Granting `/flow` (with no trailing path) is a shortcut that allows
      // ALL /flow/* routes — the visibility check is prefix-based.
      { path: "/flow", label: "Flow · Toàn bộ (shortcut)" },
      { path: "/flow/cut", label: "Flow · Cut Video" },
      { path: "/flow/merge", label: "Flow · Merge Videos" },
      { path: "/flow/extract-audio", label: "Flow · Extract Audio" },
      { path: "/flow/add-audio", label: "Flow · Merge/Replace Audio" },
      { path: "/flow/speed", label: "Flow · Change Speed" },
      { path: "/flow/resize", label: "Flow · Resize" },
      { path: "/flow/crop", label: "Flow · Crop Video" },
      { path: "/flow/extract-frames", label: "Flow · Extract Frames" },
      { path: "/flow/requests", label: "Flow · Requests (REQ)" },
      { path: "/flow/docs", label: "Flow · API Docs" },
    ],
  },
  {
    key: "servers",
    label: "Quản lý Server",
    superOnly: true,
    items: [
      { path: "/servers", label: "Servers · Quản lý VPS", adminOnly: true },
    ],
  },
  {
    key: "gateway",
    label: "Gateway Management",
    items: [
      { path: "/gateway", label: "Gateway · Toàn bộ (shortcut)" },
      { path: "/gateway/dashboard", label: "Gateway · Dashboard", adminOnly: true },
      { path: "/gateway/overview", label: "Gateway · Overview" },
      { path: "/gateway/vendors", label: "Gateway · Vendors", adminOnly: true },
      { path: "/gateway/pools", label: "Gateway · Pools", adminOnly: true },
      { path: "/gateway/functions", label: "Gateway · Functions", adminOnly: true },
      { path: "/gateway/gateway-keys", label: "Gateway · Gateway Keys", adminOnly: true },
      { path: "/gateway/api-keys", label: "Gateway · API Keys (pool)", adminOnly: true },
      { path: "/gateway/profiles", label: "Gateway · Profiles" },
      { path: "/gateway/proxies", label: "Gateway · Proxies" },
      { path: "/gateway/requests", label: "Gateway · Requests (REQ)", adminOnly: true },
      { path: "/gateway/playground", label: "Gateway · Playground" },
      { path: "/gateway/settings", label: "Gateway · Settings", adminOnly: true },
      { path: "/gateway/docs", label: "Gateway · API Docs" },
    ],
  },
];

/** Flat list — convenient when you don't care about groups. */
export const ALL_PAGES: PageDef[] = PAGE_GROUPS.flatMap((g) => g.items);

export function findPage(path: string): PageDef | undefined {
  return ALL_PAGES.find((p) => p.path === path);
}
