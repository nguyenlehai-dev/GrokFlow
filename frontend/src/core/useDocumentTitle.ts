import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useDomainStore } from "@/core/domain/store";
import { titleize } from "@/core/utils/format";
import { ALL_PAGES } from "@/modules/admin/configs/pageCatalog";

/** Update <title> as the user navigates so it reads "<Page> · <Brand>".
 *
 *  Sources, in order:
 *    - Brand: domain.brand_name (per-tenant config), fallback "GrokFlow".
 *    - Page label: first matching prefix in PAGE_GROUPS' ALL_PAGES catalog;
 *      e.g. "/flow/cut" → "Cut Video", "/admin/git" → "Git / Deploy".
 *    - Fallback: turn the last path segment into Title Case if no catalog
 *      entry matches (newly-added pages still get a decent title without
 *      having to remember to update pageCatalog).
 *
 *  Mount once from a top-level component (AppShell). Stays in sync with
 *  route + domain config — no extra wiring per page.
 */
export function useDocumentTitle() {
  const location = useLocation();
  const brand = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";

  useEffect(() => {
    const path = location.pathname || "/";

    // Find the longest-prefix match in the catalog. "/" doesn't appear in
    // ALL_PAGES so it short-circuits to brand-only.
    let bestPath = "";
    let bestLabel: string | undefined;
    for (const p of ALL_PAGES) {
      if (path === p.path || path.startsWith(p.path + "/")) {
        if (p.path.length > bestPath.length) {
          bestPath = p.path;
          bestLabel = p.label;
        }
      }
    }

    const label = bestLabel
      ?? (path === "/" ? null : titleize(path.split("/").pop() ?? ""));

    document.title = label ? `${label} · ${brand}` : brand;
  }, [location.pathname, brand]);
}
