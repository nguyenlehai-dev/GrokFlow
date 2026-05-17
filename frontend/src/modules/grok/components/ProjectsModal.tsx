import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  X, Plus, Pencil, Trash2, Layers, Globe, ExternalLink, Wand2,
  DownloadCloud, Loader2, Check, Monitor,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import type { Project } from "../models/project";
import { domainsService } from "../services/domains.service";
import { projectsService, type DiscoveredProject } from "../services/projects.service";
import { ProjectEditorModal } from "./ProjectEditorModal";
import { ProjectAutoProvisionModal } from "./ProjectAutoProvisionModal";
import { AssignDomainsModal } from "./AssignDomainsModal";
import { AssignToolInstallsModal } from "./AssignToolInstallsModal";

/** Super_admin manages the Grok projects inside a single profile.
 *
 *  - List + add + rename + delete projects (1 row per project)
 *  - Inline "assign domains" per project — multi-select of tenant domains
 *  - Project link to grok.com/project/<slug> for quick verification
 *
 *  Replaces the old ProfileDomainsModal: assignment granularity moved
 *  from profile-level to project-level so a single Grok account can
 *  serve multiple tenants without their chat history bleeding into
 *  each other.
 */

export function ProjectsModal({
  profileId, profileName, onClose,
}: { profileId: string; profileName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["grok-projects", profileId],
    queryFn: () => projectsService.list(profileId),
  });
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAdminDomains(),
  });

  const [creating, setCreating] = useState(false);
  const [autoProvision, setAutoProvision] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [assigning, setAssigning] = useState<Project | null>(null);
  const [assigningTool, setAssigningTool] = useState<Project | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => projectsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(t("grok.projects_deleted"), "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("grok.projects_error"), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-5 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <Layers size={18} className="text-violet-600" /> {t("grok.projects_title")}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <code className="font-mono">{profileName}</code> · {t("grok.projects_subtitle")}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {t("grok.projects_count", { value: projects?.length ?? 0 })}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-3 py-1.5 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 shadow-sm"
                title={t("grok.projects_add_tooltip")}
              >
                <Plus size={14} /> {t("grok.projects_add")}
              </button>
              <button
                onClick={() => setAutoProvision(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-white border border-slate-200 text-slate-700 px-3 py-1.5 text-sm font-semibold hover:bg-white"
                title={t("grok.projects_auto_tooltip")}
              >
                <Wand2 size={14} /> {t("grok.projects_auto")} <span className="text-[9px] font-bold uppercase tracking-wider px-1 rounded bg-amber-100 text-amber-700">{t("grok.projects_beta")}</span>
              </button>
            </div>
          </div>

          <DiscoverSection profileId={profileId} />

          {isLoading ? (
            <p className="text-sm text-slate-500">{t("grok.projects_loading")}</p>
          ) : (projects ?? []).length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <ul className="space-y-2">
              {projects?.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing(p)}
                  onAssign={() => setAssigning(p)}
                  onAssignTool={() => setAssigningTool(p)}
                  onDelete={() => {
                    if (confirm(t("grok.projects_delete_confirm", { name: p.name }))) {
                      remove.mutate(p.id);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t px-5 py-3 bg-white text-xs text-slate-500 flex items-center justify-between">
          <span>
            {t("grok.projects_tip_prefix")}{" "}
            <a href="https://grok.com" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline inline-flex items-center gap-0.5">
              grok.com <ExternalLink size={10} />
            </a>{" "}
            {t("grok.projects_tip_suffix")}
          </span>
          <button onClick={onClose} className="btn-ghost text-sm">{t("grok.projects_close")}</button>
        </footer>
      </div>

      {autoProvision && (
        <ProjectAutoProvisionModal
          profileId={profileId}
          profileName={profileName}
          onClose={() => setAutoProvision(false)}
        />
      )}
      {creating && (
        <ProjectEditorModal
          profileId={profileId}
          project={null}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ProjectEditorModal
          profileId={profileId}
          project={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {assigning && (
        <AssignDomainsModal
          project={assigning}
          domains={(domains ?? []).filter((d) => d.hostname !== "*")}
          onClose={() => setAssigning(null)}
        />
      )}
      {assigningTool && (
        <AssignToolInstallsModal
          project={assigningTool}
          onClose={() => setAssigningTool(null)}
        />
      )}
    </div>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────

function ProjectRow({
  p, onEdit, onAssign, onAssignTool, onDelete,
}: {
  p: Project;
  onEdit: () => void;
  onAssign: () => void;
  onAssignTool: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg ring-1 ring-slate-200 hover:ring-violet-300 bg-white p-3.5 flex items-start justify-between gap-3 transition">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">{p.name}</span>
          <code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            {p.grok_project_id}
          </code>
          <a
            href={`https://grok.com/project/${p.grok_project_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-violet-600 hover:underline inline-flex items-center gap-0.5"
            title={t("grok.projects_open_tooltip")}
          >
            {t("grok.projects_open")} <ExternalLink size={10} />
          </a>
        </div>
        {p.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={onAssign}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900"
          >
            <Globe size={11} /> {t("grok.projects_domains_assigned", { value: p.domain_count })}
          </button>
          <button
            onClick={onAssignTool}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
            title="Phân quyền cho các máy desktop (Tool Installs)"
          >
            <Monitor size={11} /> {p.tool_install_count} tool install(s)
          </button>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={onEdit} className="btn-ghost text-xs" title={t("grok.projects_edit")}>
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="btn-ghost text-xs text-rose-600" title={t("grok.projects_delete")}>
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

// ─── Discover from VNC ──────────────────────────────────────────────────
//
// Pulls the profile's actual Grok project list straight from grok.com
// (via VNC Chromium fetch — same TLS fingerprint and cookies as the
// admin's real session). Admin picks one from the dropdown → click
// Import → backend creates the row with the exact slug/name. No more
// manual copy-paste of /project/<slug>.
function DiscoverSection({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const discover = useMutation({
    mutationFn: () => projectsService.discover(profileId),
    onSuccess: (data) => {
      setOpen(true);
      setErrorMsg(null);
      // Default pick: first row that hasn't been imported yet.
      const firstAvailable = data.find((r) => !r.imported);
      setPicked(firstAvailable?.grok_project_id ?? "");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message
        ?? e?.response?.data?.detail
        ?? e?.message
        ?? "Discover failed";
      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
      setOpen(true);
    },
  });

  const importOne = useMutation({
    mutationFn: (row: DiscoveredProject) =>
      projectsService.create({
        profile_id: profileId,
        grok_project_id: row.grok_project_id,
        name: row.name,
        description: row.description ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grok-projects", profileId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast("Đã import project", "success");
      // Re-fetch discover so the row flips to `imported`.
      discover.mutate();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? "Import lỗi", "error"),
  });

  const rows = discover.data ?? [];
  const selected = rows.find((r) => r.grok_project_id === picked) ?? null;

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold text-violet-900 inline-flex items-center gap-1.5">
            <DownloadCloud size={14} /> Discover từ VNC
          </div>
          <p className="text-xs text-violet-700/80 mt-0.5">
            Đọc danh sách project hiện có trên Grok account này (cần VNC đã Auto-login).
          </p>
        </div>
        <button
          onClick={() => { setOpen(true); discover.mutate(); }}
          disabled={discover.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
        >
          {discover.isPending ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
          {discover.isPending ? "Đang quét…" : "Quét project"}
        </button>
      </div>

      {open && errorMsg && (
        <div className="mt-3 rounded bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1.5 text-xs">
          {errorMsg}
        </div>
      )}

      {open && !errorMsg && rows.length > 0 && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="flex-1 rounded-md border border-violet-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="" disabled>Chọn project…</option>
            {rows.map((r) => (
              <option key={r.grok_project_id} value={r.grok_project_id} disabled={r.imported}>
                {r.imported ? "✓ " : ""}{r.name} — {r.grok_project_id.slice(0, 12)}…
                {r.imported ? " (đã import)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => selected && !selected.imported && importOne.mutate(selected)}
            disabled={!selected || selected.imported || importOne.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {importOne.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Import
          </button>
        </div>
      )}

      {open && !errorMsg && rows.length === 0 && !discover.isPending && (
        <p className="mt-3 text-xs text-violet-700/80">
          Không tìm thấy project nào trên account. Tạo trước trên grok.com hoặc dùng "Auto provision".
        </p>
      )}
    </section>
  );
}


function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/50 py-10 text-center">
      <Layers size={32} className="mx-auto text-slate-400" />
      <p className="mt-3 font-semibold text-slate-800">{t("grok.projects_empty_title")}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
        {t("grok.projects_empty_hint_prefix")}{" "}
        <code className="font-mono">/project/</code>. {t("grok.projects_empty_hint_suffix")}
      </p>
      <button onClick={onCreate} className="btn-primary mt-4 inline-flex items-center gap-1.5">
        <Plus size={14} /> {t("grok.projects_add_first")}
      </button>
    </div>
  );
}
