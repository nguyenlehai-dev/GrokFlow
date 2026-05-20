import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  GitBranch, GitCommit, RefreshCw, Rocket, AlertCircle, CheckCircle2,
  Server, Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { GitCommit as Commit, DeployResult } from "../models/git";
import { gitService } from "../services/git.service";
import { GitRepoEnvTab } from "./GitRepoEnvTab";

type RepoSubTab = "status" | "deploy" | "containers" | "history" | "env";

export function GitRepoPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pull, setPull] = useState(true);
  const [rebuild, setRebuild] = useState(true);
  const [selectedServices, setSelectedServices] = useState<string[] | null>(null);
  const [lastResult, setLastResult] = useState<DeployResult | null>(null);
  const [subTab, setSubTab] = useState<RepoSubTab>("status");

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["git-status", repoId],
    queryFn: () => gitService.status(repoId),
    refetchInterval: 30000,
  });

  // Default selected services to repo's configured set
  useEffect(() => {
    if (status && selectedServices === null) {
      setSelectedServices(status.repo.services);
    }
  }, [status, selectedServices]);

  const deploy = useMutation({
    mutationFn: () =>
      gitService.deploy(repoId, { services: selectedServices, pull, rebuild }),
    onSuccess: (res) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["git-status", repoId] });
      toast(
        res.ok ? t("admin.git_repo_deploy_ok") : t("admin.git_repo_deploy_error"),
        res.ok ? "success" : "error",
      );
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("admin.git_repo_deploy_error_short"), "error"),
  });

  const toggleService = (s: string) => {
    setSelectedServices((prev) => {
      const current = prev ?? [];
      return current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    });
  };

  const isUpdated = status && status.commits_behind === 0;
  const behindCount = status?.commits_behind ?? null;

  if (isLoading || !status) {
    return <p className="text-slate-500">{t("admin.git_repo_loading")}</p>;
  }

  const serviceChoices = status.repo.services.length > 0
    ? status.repo.services
    : ["backend", "frontend", "worker", "idle-cleanup"];

  // Sub-tab strip — sits between the repo-level tab strip above and the
  // sectioned content below. Keeps the vertical stack scannable as each
  // repo grows more diagnostics.
  const SUBTABS: { key: RepoSubTab; label: string }[] = [
    { key: "status",     label: t("admin.git_repo_tab_status") },
    { key: "deploy",     label: t("admin.git_repo_tab_deploy") },
    { key: "containers", label: t("admin.git_repo_tab_containers") },
    { key: "history",    label: t("admin.git_repo_tab_history") },
    { key: "env",        label: t("admin.git_repo_tab_env") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-500">
          <span className="font-mono">{status.repo.github_repo}</span>
          <span className="mx-2">·</span>
          <span className="font-mono">{status.repo.local_path}</span>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          {t("admin.git_repo_refresh")}
        </button>
      </div>

      {/* Sub-tab strip */}
      <div className="flex gap-1 border-b border-slate-200">
        {SUBTABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubTab(tab.key)}
            className={`relative px-3 py-1.5 text-sm font-medium transition ${
              subTab === tab.key ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {subTab === tab.key && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {subTab === "status" && (<>
      {/* Status banner */}
      <div
        className={`card flex items-start gap-3 ${
          isUpdated ? "border-emerald-200 bg-emerald-50/30"
          : behindCount && behindCount > 0 ? "border-amber-200 bg-amber-50/30"
          : ""
        }`}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
          {isUpdated
            ? <CheckCircle2 size={20} className="text-emerald-600" />
            : behindCount && behindCount > 0
            ? <AlertCircle size={20} className="text-amber-600" />
            : <GitBranch size={20} className="text-slate-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">
            {isUpdated
              ? t("admin.git_repo_status_up_to_date")
              : behindCount && behindCount > 0
              ? t("admin.git_repo_status_behind", { value: behindCount })
              : t("admin.git_repo_status_unknown")}
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {t("admin.git_repo_branch_label")}: <code className="font-mono">{status.branch}</code>
            {status.is_dirty && (
              <span className="ml-2 text-rose-600 font-medium">{t("admin.git_repo_dirty")}</span>
            )}
          </p>
        </div>
      </div>

      {/* Current + remote commit cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        <CommitCard title={t("admin.git_repo_commit_vps")} commit={status.current_commit} />
        <CommitCard title={t("admin.git_repo_commit_github")} commit={status.remote_latest} />
      </div>
      </>)}

      {subTab === "deploy" && (<>
      {/* Deploy controls */}
      <section className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Rocket size={16} className="text-brand-600" /> {t("admin.git_repo_deploy")}
        </h2>

        <div>
          <div className="text-sm font-medium mb-1.5">{t("admin.git_repo_services")}</div>
          <div className="flex flex-wrap gap-2">
            {serviceChoices.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleService(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  (selectedServices ?? []).includes(s)
                    ? "bg-brand-50 border-brand-500 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:bg-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pull} onChange={(e) => setPull(e.target.checked)} />
            <span>{t("admin.git_repo_git_pull_first")}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} />
            <span>{t("admin.git_repo_rebuild_image")}</span>
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => {
              if (!confirm(t("admin.git_repo_deploy_confirm", { label: status.repo.label }))) return;
              deploy.mutate();
            }}
            disabled={deploy.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {deploy.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> {t("admin.git_repo_deploying")}</>
            ) : (
              <><Rocket size={14} /> {t("admin.git_repo_deploy_now")}</>
            )}
          </button>
          {deploy.isPending && (
            <span className="text-xs text-slate-500">{t("admin.git_repo_deploy_hint")}</span>
          )}
        </div>
      </section>

      {/* Deploy log */}
      {lastResult && (
        <section className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              {lastResult.ok
                ? <CheckCircle2 size={16} className="text-emerald-600" />
                : <AlertCircle size={16} className="text-rose-600" />}
              {t("admin.git_repo_last_result")}
            </h3>
            <span className="text-xs text-slate-500">{lastResult.duration_seconds}s</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs whitespace-pre-wrap overflow-auto max-h-96">
            {lastResult.log}
          </pre>
        </section>
      )}
      </>)}

      {subTab === "containers" && (<>
      {/* Containers */}
      <section className="card space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Server size={16} /> {t("admin.git_repo_containers")}
        </h2>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-white text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">{t("admin.git_repo_col_name")}</th>
                <th className="px-3 py-2">{t("admin.git_repo_col_status")}</th>
                <th className="px-3 py-2">{t("admin.git_repo_col_started")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {status.containers.map((c) => (
                <tr key={c.name}>
                  <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs ${
                      c.status.toLowerCase().includes("up") && !c.status.includes("unhealthy")
                        ? "text-emerald-700"
                        : c.status.includes("unhealthy") || c.status.toLowerCase().includes("exited")
                        ? "text-rose-700"
                        : "text-slate-600"
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{c.started_at ?? "—"}</td>
                </tr>
              ))}
              {status.containers.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">{t("admin.git_repo_no_containers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>)}

      {subTab === "history" && (
        <section className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <GitCommit size={16} /> {t("admin.git_repo_recent_commits")}
          </h2>
          <div className="space-y-1">
            {status.recent_commits.map((c) => (
              <div key={c.hash} className="border border-slate-200 rounded px-3 py-2 text-sm hover:bg-white">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <code className="font-mono text-xs text-amber-700">{c.short}</code>
                  <span className="text-xs text-slate-500">{c.date}</span>
                </div>
                <div className="text-slate-800 mt-0.5 truncate">{c.message}</div>
                <div className="text-xs text-slate-500">{c.author}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {subTab === "env" && <GitRepoEnvTab repoId={repoId} />}
    </div>
  );
}

function CommitCard({ title, commit }: { title: string; commit: Commit | null }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-600 mb-2">{title}</h3>
      {commit ? (
        <div className="space-y-1">
          <div className="font-mono text-xs text-amber-700">{commit.short}</div>
          <div className="text-sm font-medium text-slate-800">{commit.message}</div>
          <div className="text-xs text-slate-500">{commit.author}</div>
          <div className="text-xs text-slate-400 font-mono">{commit.date}</div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}
