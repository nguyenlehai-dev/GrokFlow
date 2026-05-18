import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { Domain } from "../models/domain";
import { domainsService } from "../services/domains.service";

type TemplateKey = "default" | "admin";

interface TemplateInfo {
  key: TemplateKey;
  name: string;
  description: string;
  hint: string;
  preview: React.ReactNode;
}

const TEMPLATES: TemplateInfo[] = [
  {
    key: "default",
    name: "Default — Branded",
    description: "Split panel marketing: art bên trái + form bên phải. Hợp cho domain public, có brand riêng, cho phép register.",
    hint: "Visible khi user vào /login từ hostname này.",
    preview: <DefaultPreview />,
  },
  {
    key: "admin",
    name: "Admin — Console",
    description: "Form đơn ở giữa, nền tối, không marketing copy, không link register. Hợp cho hostname nội bộ hoặc /admin/login.",
    hint: "/admin/login luôn ép template này, không phụ thuộc domain.",
    preview: <AdminPreview />,
  },
];

export function AdminLoginTemplatesPage() {
  const qc = useQueryClient();
  const { data: domains, isLoading } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.list(),
  });

  const update = useMutation({
    mutationFn: ({ id, template }: { id: string; template: TemplateKey }) =>
      domainsService.update(id, { login_template: template }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      toast("Đã cập nhật template", "success");
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? "Lưu thất bại", "error"),
  });

  const counts = useMemo(() => {
    const c: Record<TemplateKey, number> = { default: 0, admin: 0 };
    (domains ?? []).forEach((d) => {
      const k = (d.login_template ?? "default") as TemplateKey;
      if (k in c) c[k]++;
    });
    return c;
  }, [domains]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Login Templates</h1>
        <p className="text-sm text-slate-500">
          Chọn giao diện trang đăng nhập cho từng domain. Mỗi domain dùng đúng 1 template.
          URL <code className="px-1 rounded bg-slate-100">/admin/login</code> luôn ép template <strong>Admin</strong>.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((tpl) => (
          <article
            key={tpl.key}
            className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  {tpl.key === "admin" ? (
                    <ShieldCheck size={16} className="text-emerald-600" />
                  ) : (
                    <Sparkles size={16} className="text-blue-600" />
                  )}
                  {tpl.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dùng bởi <strong>{counts[tpl.key]}</strong> domain
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {tpl.key}
              </span>
            </div>
            <p className="text-sm text-slate-700">{tpl.description}</p>
            <p className="text-xs text-slate-500">{tpl.hint}</p>
            <div className="border rounded-md overflow-hidden bg-slate-50">
              {tpl.preview}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-900">Gán template cho domain</h2>
          {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </header>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
            <tr>
              <th className="px-4 py-2">Hostname</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {(domains ?? []).map((d) => (
              <DomainRow
                key={d.id}
                domain={d}
                onChange={(template) => update.mutate({ id: d.id, template })}
                isSaving={update.isPending && update.variables?.id === d.id}
              />
            ))}
            {domains && domains.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Chưa có domain.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function DomainRow({
  domain, onChange, isSaving,
}: {
  domain: Domain;
  onChange: (template: TemplateKey) => void;
  isSaving: boolean;
}) {
  const current = (domain.login_template ?? "default") as TemplateKey;
  const isDefault = domain.hostname === "*";
  return (
    <tr className="border-t hover:bg-slate-50">
      <td className="px-4 py-2 font-mono text-xs">
        {domain.hostname}
        {isDefault && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">fallback</span>
        )}
      </td>
      <td className="px-4 py-2">{domain.label}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded ${domain.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {domain.status}
        </span>
      </td>
      <td className="px-4 py-2">
        <select
          className="input py-1 text-sm"
          value={current}
          onChange={(e) => onChange(e.target.value as TemplateKey)}
          disabled={isSaving}
        >
          <option value="default">Default (branded)</option>
          <option value="admin">Admin (minimal)</option>
        </select>
      </td>
      <td className="px-4 py-2 text-right">
        {!isDefault && (
          <a
            href={`http://${domain.hostname}:5173/login`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            title="Preview /login"
          >
            <ExternalLink size={12} /> Preview
          </a>
        )}
      </td>
    </tr>
  );
}

function DefaultPreview() {
  return (
    <div className="h-32 flex">
      <div className="flex-1 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-3 text-white text-[10px]">
        <div className="font-bold">Brand</div>
        <div className="mt-2 space-y-1 opacity-90">
          <div>• AI bullet</div>
          <div>• AI bullet</div>
          <div>• AI bullet</div>
        </div>
      </div>
      <div className="flex-1 bg-white p-3 space-y-2">
        <div className="h-3 w-20 bg-slate-800 rounded" />
        <div className="h-1.5 w-16 bg-slate-200 rounded" />
        <div className="space-y-1 mt-2">
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-blue-600 rounded" />
        </div>
      </div>
    </div>
  );
}

function AdminPreview() {
  return (
    <div className="h-32 bg-slate-900 flex items-center justify-center p-3">
      <div className="w-3/4 bg-slate-800 border border-slate-700 rounded-md p-3 space-y-1.5">
        <div className="flex justify-center">
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
        </div>
        <div className="h-2 bg-slate-700 rounded mx-auto w-16" />
        <div className="space-y-1 mt-2">
          <div className="h-3 bg-slate-700 rounded" />
          <div className="h-3 bg-slate-700 rounded" />
          <div className="h-3 bg-emerald-500 rounded" />
        </div>
      </div>
    </div>
  );
}
