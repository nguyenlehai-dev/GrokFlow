import { findPage } from "../configs/pageCatalog";

/** Inline pages summary — shows count + the first 3 labels, with a
 *  tooltip on hover listing the full set. Keeps the table dense but
 *  still gives admins a quick sense of what's granted. */
export function RolesPagesCell({ paths }: { paths: string[] }) {
  const labels = paths.map((p) => findPage(p)?.label ?? p);
  const tooltip = labels.join("\n");
  const preview = labels.slice(0, 3).join(", ");
  return (
    <div className="text-xs" title={tooltip}>
      <span className="font-mono text-slate-700">{paths.length} page</span>
      {paths.length > 0 && (
        <div className="text-slate-500 mt-0.5 line-clamp-1 max-w-[16rem]">
          {preview}
          {paths.length > 3 && <span className="text-slate-9000"> +{paths.length - 3}</span>}
        </div>
      )}
    </div>
  );
}
