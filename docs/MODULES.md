# Module System

Each top-level menu group in the FE is a **module** — a self-contained
folder under `frontend/src/modules/` that owns its routes + sidebar
entries + (optionally) its own API base URL.

The router and sidebar are auto-built from a central registry — modules
plug in by exporting a `moduleManifest`. No router edits, no sidebar
edits, no global state pollution.

## File layout of a module

```
frontend/src/modules/<name>/
├─ index.tsx          ← MUST export `moduleManifest: FrontendModule`
├─ api.ts             ← (optional) axios instance for this module
├─ XxxPage.tsx        ← page components
├─ SomeModal.tsx      ← module-private components
└─ store.ts           ← (optional) zustand store for module-local state
```

The only hard rule: **`index.tsx` exports a `moduleManifest`** matching
the shape defined in `frontend/src/app/types.ts`.

## The manifest

```typescript
// frontend/src/app/types.ts
export interface FrontendModule {
  name: string;          // "grok" — stable id, used in logs
  label: string;         // "Quản lý Grok" — for documentation
  apiBaseUrl?: string;   // "" or "https://grok-api.example.com"
  routes: ModuleRoute[]; // react-router child routes
  nav?: NavEntry[];      // sidebar entries (omit for public modules)
}

export interface ModuleRoute {
  path: string;          // "jobs" — no leading slash
  element: ReactNode;    // pre-built React element
}

export type NavEntry = NavLeaf | NavGroup;
export interface NavLeaf {
  type: "link";
  to: string;            // "/jobs"
  label: string;
  icon: LucideIcon;
  feature?: string;      // entitlement key (admins bypass)
  adminOnly?: boolean;   // admin OR super_admin
  superOnly?: boolean;   // super_admin only
}
```

## The registry

```typescript
// frontend/src/app/moduleRegistry.ts
import { moduleManifest as admin } from "@/modules/admin";
import { moduleManifest as grok } from "@/modules/grok";
// …

export const MODULES: FrontendModule[] = [admin, grok, flow, gateway, auth, landing];
export const PUBLIC_MODULES = new Set(["auth", "landing"]);

export function getAuthedRoutes(): ModuleRoute[] { /* … */ }
export function getAuthedNav(): NavEntry[]       { /* … */ }
export function getPublicRoutes(): ModuleRoute[] { /* … */ }
```

`router.tsx` reads `getAuthedRoutes()` to mount inside `<ProtectedRoute>`,
and `getPublicRoutes()` for the public side. `AppShell.tsx` reads
`getAuthedNav()` to build the sidebar.

## Adding a new module

1. **Create the folder + pages:**

   ```
   frontend/src/modules/billing-v2/
   ├─ index.tsx
   ├─ InvoicesPage.tsx
   └─ PaymentMethodsPage.tsx
   ```

2. **Write the manifest** in `index.tsx`:

   ```tsx
   import { Receipt, CreditCard } from "lucide-react";
   import type { FrontendModule } from "@/app/types";
   import { lazyPage } from "@/app/lazyPage";

   export const moduleManifest: FrontendModule = {
     name: "billing-v2",
     label: "Billing v2",
     apiBaseUrl: import.meta.env.VITE_MODULE_BILLING_API ?? "",
     routes: [
       { path: "billing-v2/invoices", element: lazyPage(
           () => import("./InvoicesPage"), "InvoicesPage") },
       { path: "billing-v2/payment-methods", element: lazyPage(
           () => import("./PaymentMethodsPage"), "PaymentMethodsPage") },
     ],
     nav: [{
       type: "group",
       key: "billing-v2",
       label: "Billing v2",
       icon: Receipt,
       items: [
         { type: "link", to: "/billing-v2/invoices",
           label: "Invoices", icon: Receipt },
         { type: "link", to: "/billing-v2/payment-methods",
           label: "Payment Methods", icon: CreditCard },
       ],
     }],
   };
   ```

3. **Register in `moduleRegistry.ts`:**

   ```typescript
   import { moduleManifest as billingV2 } from "@/modules/billing-v2";

   export const MODULES = [
     admin, grok, flow, gateway, billingV2,  // ← add here
     auth, landing,
   ];
   ```

That's it. Sidebar shows the new group, routes mount, lazy chunks split
automatically. Permissions still flow through `userCanSeePath()` so a
domain admin who hasn't been granted `/billing-v2/*` simply doesn't see
the menu.

## Lazy-loaded pages

Every page should use `lazyPage()` so it gets its own Vite chunk:

```tsx
import { lazyPage } from "@/app/lazyPage";

// instead of:
//   import { JobsPage } from "./JobsPage";
//   { path: "jobs", element: <JobsPage /> }
//
// do:
{ path: "jobs", element: lazyPage(() => import("./JobsPage"), "JobsPage") }
```

`JobsPage` must be a named export (`export function JobsPage(…)`).
`lazyPage` wraps the import in `React.lazy` + `<Suspense fallback={…}>`
with a small spinner.

## Module-specific API client

When a module's BE eventually moves to its own repo / host, you want a
1-line switch. `core/api/factory.ts` provides `createHttp(baseURL)` that
builds an axios instance with the same JWT interceptor / 401 redirect /
toast handling as the default `api`, but parameterized:

```typescript
// frontend/src/modules/grok/api.ts
import { createHttp } from "@/core/api/factory";
import { moduleManifest } from ".";

export const grokApi = createHttp(moduleManifest.apiBaseUrl);
```

Then every Grok page imports `grokApi` instead of the global `api`. To
point Grok at a remote BE, set `VITE_MODULE_GROK_API=https://grok.example.com`
at build time — no code change.

## Where guards live

- **Domain-level page allowlist** is enforced inside `userCanSeePath()`
  (which both `AppShell.canSeeLeaf` and `ProtectedRoute` call). Don't
  re-check inside the page.
- **Role-tier checks** (admin-only buttons, super-only inputs) go via
  `useAuthStore` + the `isAnyAdmin`/`isSuperAdmin` helpers in
  `core/permissions.ts`. Never hard-code `user.role === "admin"` in
  module code.
- **Entitlement feature flags** come from `core/entitlements/catalog.ts`;
  put the key in `NavLeaf.feature` and the gate is automatic.

## What modules MUST NOT do

- Import from another module (`import … from "@/modules/grok/…"` inside
  `modules/admin/`). If two modules share something, lift it to
  `components/` or `core/`.
- Mutate the auth/domain stores. Use the exposed setters.
- Define their own JWT decoder, role enum, or permission helper.
- Route to a path another module already owns.
