interface UrlInputProps {
  value: string;
  onChange: (v: string) => void;
}

// URL-bypass input. Pasting an existing R2/Cloudflare URL skips the local
// file upload step and feeds the job directly. Cosmetically optional on
// dual-input tools (ambiguous which slot the URL belongs to).
export function UrlInput({ value, onChange }: UrlInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-9000">
        <span className="h-px flex-1 bg-slate-200" />
        <span>OR</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste an existing R2/Cloudflare URL to bypass upload..."
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-white placeholder:text-slate-9000 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />
    </div>
  );
}
