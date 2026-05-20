import { ComponentType, lazy, ReactElement, Suspense } from "react";

/** Spinner shown while a lazy-loaded page module is being fetched.
 *  Tiny, centered, on-brand — matches the rest of the UI. */
function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 rounded-full border-2 border-blue-200 border-t-brand-500 animate-spin" />
    </div>
  );
}

/** Wrap a dynamic-import in React.lazy + Suspense so a route slot can be
 *  declared as one expression. Each call ends up as its own Vite chunk.
 *
 *  Usage in a module manifest:
 *
 *    routes: [
 *      { path: "dashboard", element: lazyPage(
 *          () => import("./DashboardPage"), "DashboardPage") },
 *    ],
 *
 *  Pass `exportName` to pick a named export; omit it if the page is the
 *  module's `default` export. */
export function lazyPage<T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
): ReactElement {
  const Lazy = lazy(async () => {
    const mod = await loader();
    // Cast through unknown so generic-constrained T doesn't fight the
    // default ComponentType<{}> we render as <Lazy /> below.
    return { default: mod[exportName] as unknown as ComponentType };
  });
  return (
    <Suspense fallback={<PageSpinner />}>
      <Lazy />
    </Suspense>
  );
}
