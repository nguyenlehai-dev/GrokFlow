// Catalog of all authed routes admin can grant per-domain / per-role.
// Grouped by parent menu (matches the sidebar in AppShell) so the admin
// UI can render group-level "Select all" toggles instead of a flat soup
// of checkboxes. Keep in sync with router.tsx + AppShell.tsx.
//
// TWO catalogs live here — they have *different* scopes:
//   • PAGE_GROUPS — admin web app: granted to roles / domains. Lists pages
//     admins, support staff, and regular users see in the sidebar.
//   • TOOL_PAGE_GROUPS — desktop kiosk: granted to Tool Installs. Lists
//     pages a kiosk-machine user is allowed to open. Includes CVP (the
//     kiosk workspace) and OMITS admin-only pages (/admin/*, /servers,
//     gateway dev tools) since kiosks aren't admin terminals.
//
// Used by:
//   - AdminRolesPage / AdminDomainsTab — render the admin page-allowlist
//     UI (PAGE_GROUPS).
//   - AdminToolInstallsPage — render the tool-install allowlist UI
//     (TOOL_PAGE_GROUPS).
//   - useDocumentTitle — map a route prefix to its human-readable page
//     name for the browser tab title (ALL_PAGES, union of both).

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
      { path: "/checkout", label: "Checkout" },
      { path: "/audit-logs", label: "Audit Log" },
      { path: "/settings", label: "Settings" },
    ],
  },
  {
    key: "gallery",
    label: "Gallery",
    items: [
      { path: "/gallery", label: "Gallery · Toàn bộ (shortcut)" },
      { path: "/gallery/images", label: "Gallery · Ảnh" },
      { path: "/gallery/videos", label: "Gallery · Video" },
      { path: "/gallery/prompts", label: "Gallery · Prompts" },
      { path: "/gallery/flow", label: "Gallery · Flow" },
      { path: "/gallery/gateway", label: "Gallery · Gateway" },
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
      { path: "/admin/tool-installs", label: "Admin · Tool Installs", adminOnly: true },
      { path: "/admin/login-templates", label: "Admin · Login Templates", adminOnly: true },
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
      // NOTE: /create-video-pro is intentionally absent — it's a kiosk
      // workspace, not an admin page. See TOOL_PAGE_GROUPS below.
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
    key: "tool_dist",
    label: "Tool Distribution",
    superOnly: true,
    items: [
      { path: "/tools", label: "Tool · Toàn bộ (shortcut)", adminOnly: true },
      { path: "/tools/win", label: "Tool · Windows installers", adminOnly: true },
      { path: "/tools/mac", label: "Tool · macOS installers", adminOnly: true },
      { path: "/tools/document", label: "Tool · Documents", adminOnly: true },
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

// ─── Tool Install allowlist catalog ──────────────────────────────────────
//
// Scope: pages a desktop-kiosk machine is allowed to open. Different from
// the admin catalog because kiosk users:
//   • aren't admins → no /admin/*, no /servers
//   • aren't devs → no gateway, no api-docs
//   • DO use the Create Video Pro workspace as their main screen
// Keep this curated, not auto-derived — fewer checkboxes = clearer install
// configuration for the admin granting access to a customer's machine.
export const TOOL_PAGE_GROUPS: PageGroup[] = [
  {
    key: "grok-tool-cvp",
    label: "Create Video Pro — panels trong kiosk",
    items: [
      // Grant the parent to give ALL panels (prefix-match in isPageAllowed
      // means /create-video-pro/* inherits). Grant specific child paths
      // instead to restrict — only the granted panels show in sidebar.
      { path: "/create-video-pro", label: "Toàn bộ panels (shortcut)" },
      { path: "/create-video-pro/text-to-video",  label: "Text → Video Pro" },
      { path: "/create-video-pro/image-to-video", label: "Image → Video" },
      { path: "/create-video-pro/character-sync", label: "Đồng bộ nhân vật" },
      { path: "/create-video-pro/image-sync",     label: "Tạo ảnh đồng bộ" },
      { path: "/create-video-pro/image-direct",   label: "Tạo ảnh trực tiếp" },
      { path: "/create-video-pro/auto-login",     label: "Grok Auto Login" },
    ],
  },
  {
    key: "grok-tool",
    label: "Tool Grok (kiosk) — khác",
    items: [
      // Read-only views into Grok internals — useful for the customer to
      // see their own job history and test prompts before batching.
      { path: "/profiles", label: "Profiles (xem profile Grok)" },
      { path: "/jobs", label: "Jobs (lịch sử job)" },
      { path: "/grok/playground", label: "Playground (test prompt)" },
    ],
  },
  {
    key: "core",
    label: "Tài khoản",
    items: [
      { path: "/dashboard", label: "Dashboard" },
      { path: "/api-keys", label: "API Keys" },
      { path: "/billing", label: "Billing (gói cước)" },
      { path: "/checkout", label: "Checkout (nâng cấp)" },
      { path: "/settings", label: "Settings (đổi mật khẩu)" },
    ],
  },
  {
    key: "gallery",
    label: "Gallery (xem kết quả)",
    items: [
      { path: "/gallery", label: "Gallery · Toàn bộ (shortcut)" },
      { path: "/gallery/images", label: "Gallery · Ảnh" },
      { path: "/gallery/videos", label: "Gallery · Video" },
    ],
  },
  {
    key: "flow-tool",
    label: "Flow (chỉnh video)",
    items: [
      { path: "/flow", label: "Flow · Toàn bộ (shortcut)" },
      { path: "/flow/cut", label: "Flow · Cut Video" },
      { path: "/flow/merge", label: "Flow · Merge Videos" },
      { path: "/flow/extract-audio", label: "Flow · Extract Audio" },
      { path: "/flow/add-audio", label: "Flow · Merge/Replace Audio" },
      { path: "/flow/speed", label: "Flow · Change Speed" },
      { path: "/flow/resize", label: "Flow · Resize" },
      { path: "/flow/crop", label: "Flow · Crop Video" },
      { path: "/flow/extract-frames", label: "Flow · Extract Frames" },
    ],
  },
];

/** Flat list across BOTH catalogs — used by useDocumentTitle/findPage to
 *  resolve route → label regardless of which catalog the page lives in. */
const _adminPages = PAGE_GROUPS.flatMap((g) => g.items);
const _toolPages = TOOL_PAGE_GROUPS.flatMap((g) => g.items);
export const ALL_PAGES: PageDef[] = [
  ..._adminPages,
  // De-dupe by path — many pages exist in both catalogs (Dashboard, etc.)
  ..._toolPages.filter((tp) => !_adminPages.some((ap) => ap.path === tp.path)),
];

export function findPage(path: string): PageDef | undefined {
  return ALL_PAGES.find((p) => p.path === path);
}
