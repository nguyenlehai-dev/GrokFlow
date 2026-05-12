// Catalog of all authed routes admin can grant per-domain / per-role.
// Grouped by parent menu (matches the sidebar in AppShell) so the admin
// UI can render group-level "Select all" toggles instead of a flat soup
// of checkboxes. Keep in sync with router.tsx + AppShell.tsx.

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
    ],
  },
  {
    key: "grok",
    label: "Quản lý Grok",
    items: [
      { path: "/profiles", label: "Profiles" },
      { path: "/jobs", label: "Jobs" },
      { path: "/api-docs", label: "API Docs (Grok)" },
    ],
  },
  {
    key: "flow",
    label: "Quản lý Flow",
    items: [
      { path: "/flow", label: "Flow (toàn nhóm)" },
    ],
  },
  {
    key: "gateway",
    label: "Gateway Management",
    items: [
      { path: "/gateway", label: "Gateway (toàn nhóm)" },
      { path: "/gateway/dashboard", label: "Gateway · Dashboard", adminOnly: true },
      { path: "/gateway/gateway-keys", label: "Gateway · Gateway Keys", adminOnly: true },
      { path: "/gateway/requests", label: "Gateway · Requests", adminOnly: true },
      { path: "/gateway/playground", label: "Gateway · Playground" },
      { path: "/gateway/docs", label: "Gateway · API Docs" },
      // Provider config — readable by per-domain admin, writes are super only.
      { path: "/gateway/vendors", label: "Gateway · Vendors (read)", adminOnly: true },
      { path: "/gateway/pools", label: "Gateway · Pools (read)", adminOnly: true },
      { path: "/gateway/functions", label: "Gateway · Functions (read)", adminOnly: true },
    ],
  },
  {
    key: "billing",
    label: "Billing & Settings",
    items: [
      { path: "/billing", label: "Billing (user)" },
      { path: "/pricing", label: "Pricing" },
      { path: "/checkout", label: "Checkout" },
      { path: "/audit-logs", label: "Audit Log" },
      { path: "/settings", label: "Settings" },
    ],
  },
];

/** Flat list — convenient when you don't care about groups. */
export const ALL_PAGES: PageDef[] = PAGE_GROUPS.flatMap((g) => g.items);

export function findPage(path: string): PageDef | undefined {
  return ALL_PAGES.find((p) => p.path === path);
}
