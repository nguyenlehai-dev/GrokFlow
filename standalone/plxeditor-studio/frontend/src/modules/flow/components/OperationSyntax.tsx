import type { ToolDef } from "../configs/tools";

interface OpSyntaxProps {
  tool: ToolDef;
  values: Record<string, string | number | boolean>;
  onChange: (k: string, v: string | number | boolean) => void;
}

// Dynamic form rendered from tool.fields. Each tool defines its own field
// schema in configs/tools.ts; this component renders + collects them.
export function OperationSyntax({ tool, values, onChange }: OpSyntaxProps) {
  const fields = tool.fields;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
        Operation Syntax
      </p>
      {fields.length === 0 ? (
        <p className="text-sm italic text-slate-500">{tool.helperText}</p>
      ) : (
        <>
          {tool.helperText && (
            <p className="mb-4 text-xs italic text-slate-500">{tool.helperText}</p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.kind === "boolean" ? "sm:col-span-2" : ""}>
                {f.kind === "boolean" ? (
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!values[f.name]}
                      onChange={(e) => onChange(f.name, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-200 accent-violet-600"
                    />
                    <span className="font-medium">{f.label}</span>
                    {f.help && <span className="text-xs text-slate-500">({f.help})</span>}
                  </label>
                ) : (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
                    <input
                      type={f.kind === "number" ? "number" : "text"}
                      value={String(values[f.name] ?? "")}
                      placeholder={f.placeholder}
                      step={f.step}
                      min={f.min}
                      max={f.max}
                      onChange={(e) => {
                        const raw = e.target.value;
                        onChange(
                          f.name,
                          f.kind === "number" ? (raw === "" ? "" : Number(raw)) : raw,
                        );
                      }}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-white placeholder:text-slate-9000 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
