import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Play, RotateCw, Square, Power, Monitor, Calendar, Database,
  Server as ServerIcon, ArchiveRestore, ClipboardList, BarChart3, FileText,
  ChevronLeft,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { AdminGuard } from "@/modules/admin/components/AdminGuard";
import { serversService } from "../services/servers.service";
import type { ServerAction } from "../models/types";
import { ServerActionTile } from "../components/ServerActionTile";
import { ServerMeter } from "../components/ServerMeter";
import { BackupHistoryCard } from "../components/BackupHistoryCard";
import { RebootScheduleModal } from "../components/RebootScheduleModal";
import { BackupConfigModal } from "../components/BackupConfigModal";

export function ServerDetailPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showRebootSchedule, setShowRebootSchedule] = useState(false);
  const [showBackupConfig, setShowBackupConfig] = useState(false);

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", id],
    queryFn: () => serversService.get(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const { data: backups = [] } = useQuery({
    queryKey: ["server-backups", id],
    queryFn: () => serversService.listBackups(id),
    enabled: !!id,
  });

  const actionMut = useMutation({
    mutationFn: (a: ServerAction) => serversService.runAction(id, a),
    onSuccess: (res) => {
      toast(res.message ?? "OK", res.ok ? "success" : "error");
      qc.invalidateQueries({ queryKey: ["server", id] });
      qc.invalidateQueries({ queryKey: ["servers"] });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (backupId: string) => serversService.restoreBackup(id, backupId),
    onSuccess: (res) => toast(res.message ?? "OK", res.ok ? "success" : "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (backupId: string) => serversService.deleteBackup(id, backupId),
    onSuccess: (res) => {
      toast(res.message ?? "OK", res.ok ? "success" : "error");
      qc.invalidateQueries({ queryKey: ["server-backups", id] });
    },
  });

  const isStopped = server?.status === "stopped";
  const isActive = server?.status === "active";

  const statusBadge = useMemo(() => {
    if (!server) return null;
    const map: Record<typeof server.status, string> = {
      active: "bg-emerald-50 text-emerald-700 border-emerald-200",
      stopped: "bg-slate-100 text-slate-600 border-slate-200",
      suspended: "bg-amber-50 text-amber-700 border-amber-200",
      error: "bg-rose-50 text-rose-700 border-rose-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[server.status]}`}>
        {server.status === "active" ? "Active" : server.status === "stopped" ? "Stopped"
          : server.status === "suspended" ? "Suspended" : "Error"}
      </span>
    );
  }, [server]);

  if (isLoading) {
    return <div className="py-12 text-center text-slate-500">{t("admin.servers_loading")}</div>;
  }
  if (!server) {
    return (
      <div className="card">
        <div className="text-slate-600">
          {t("admin.servers_not_found")} <code>{id}</code>.
        </div>
        <Link to="/servers" className="btn-ghost mt-3 inline-flex items-center gap-1 text-xs">
          <ChevronLeft size={14} /> {t("admin.servers_back_to_list")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to="/servers" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ChevronLeft size={14} /> {t("admin.servers_back_list")}
          </Link>
          <h1 className="page-title mt-1 flex items-center gap-2">
            <ServerIcon size={22} /> {server.hostname}
            <span className="text-base font-normal text-slate-500">· {server.ip}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            {statusBadge}
            <span>{server.os}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left column: control panel + tools + info */}
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              {t("admin.servers_panel_control")}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              <ServerActionTile
                icon={Play} label={t("admin.servers_action_start")} tone="info"
                disabled={isActive || actionMut.isPending}
                onClick={() => actionMut.mutate("start")}
              />
              <ServerActionTile
                icon={RotateCw} label={t("admin.servers_action_reboot")} tone="warn"
                disabled={isStopped || actionMut.isPending}
                onClick={() => actionMut.mutate("reboot")}
              />
              <ServerActionTile
                icon={Square} label={t("admin.servers_action_stop")} tone="danger"
                disabled={isStopped || actionMut.isPending}
                onClick={() => actionMut.mutate("stop")}
              />
              <ServerActionTile
                icon={Power} label={t("admin.servers_action_shutdown")} tone="danger"
                disabled={isStopped || actionMut.isPending}
                onClick={() => actionMut.mutate("shutdown")}
              />
              <ServerActionTile
                icon={Monitor} label={t("admin.servers_action_vnc")} tone="primary"
                onClick={() => toast("NoVNC console: TODO", "info")}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              {t("admin.servers_panel_tools")}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              <ServerActionTile
                icon={ArchiveRestore} label={t("admin.servers_action_reinstall")} tone="warn"
                onClick={() => {
                  if (confirm(t("admin.servers_confirm_reinstall").replace("{label}", server.hostname))) {
                    actionMut.mutate("reinstall");
                  }
                }}
              />
              <ServerActionTile
                icon={Database} label="Backup config" tone="info"
                onClick={() => setShowBackupConfig(true)}
              />
              <ServerActionTile
                icon={Calendar} label="Lịch reboot" tone="info"
                onClick={() => setShowRebootSchedule(true)}
              />
              <ServerActionTile
                icon={BarChart3} label={t("admin.servers_action_graphs")} tone="success"
                onClick={() => toast("Graphs: TODO", "info")}
              />
              <ServerActionTile
                icon={FileText} label={t("admin.servers_action_logs")} tone="neutral"
                onClick={() => toast("Logs: TODO", "info")}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              {t("admin.servers_panel_info")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCell label={t("admin.servers_info_status")} value={statusBadge ?? "—"} />
              <InfoCell label={t("admin.servers_info_hostname")} value={server.hostname} />
              <InfoCell label={t("admin.servers_info_boot")} value={server.boot_order} />
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <ServerMeter
                label={t("admin.servers_cpu_usage")}
                value={server.cpu_usage_pct}
                max={100}
                caption={`${server.cpu_usage_pct}% ${t("common.of")} ${server.cpu_cores} ${t("admin.servers_card_metric_cores")}`}
                tone="emerald"
              />
              <ServerMeter
                label={t("admin.servers_memory")}
                value={server.memory_used_gb}
                max={server.memory_total_gb}
                caption={`${server.memory_used_gb.toFixed(1)}GB/${server.memory_total_gb}GB`}
                tone="sky"
              />
              <ServerMeter
                label={t("admin.servers_network")}
                value={server.network_in_mbps + server.network_out_mbps}
                max={server.network_cap_mbps}
                caption={`${server.network_in_mbps + server.network_out_mbps} Mbps/${server.network_cap_mbps} Mbps`}
                tone="amber"
              />
            </div>
          </section>
        </div>

        {/* Right column: backup history */}
        <BackupHistoryCard
          backups={backups}
          onRestore={(bid) => {
            if (confirm(t("admin.servers_confirm_restore"))) {
              restoreMut.mutate(bid);
            }
          }}
          onDelete={(bid) => {
            if (confirm(t("admin.servers_confirm_delete_backup"))) deleteMut.mutate(bid);
          }}
          onCreate={() => setShowBackupConfig(true)}
        />
      </div>

      {showRebootSchedule && (
        <RebootScheduleModal serverId={id} onClose={() => setShowRebootSchedule(false)} />
      )}
      {showBackupConfig && (
        <BackupConfigModal serverId={id} onClose={() => setShowBackupConfig(false)} />
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
