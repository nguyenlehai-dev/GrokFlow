import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers, Plus } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { GatewayProfileCard } from "../components/GatewayProfileCard";
import { GatewayProfileEditorModal } from "../components/GatewayProfileEditorModal";
import type { SessionCheckRecord } from "../configs/providerVisuals";
import { profilesService } from "../services/profiles.service";
import { proxiesService } from "../services/proxies.service";
import type { Profile } from "../models/profile";
import { extractError } from "../utils/common";

export function GatewayProfilesPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [sessionChecks, setSessionChecks] = useState<Record<string, SessionCheckRecord>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ["gw-profiles"],
    queryFn: () => profilesService.list(),
    retry: false,
  });
  const { data: proxies } = useQuery({
    queryKey: ["gw-proxies"],
    queryFn: () => proxiesService.list(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => profilesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast(t("gateway.gw_profiles_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const uploadCookies = async (profileId: string, file: File) => {
    setBusyId(profileId);
    try {
      await profilesService.uploadCookies(profileId, file);
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast(t("gateway.gw_profiles_cookies_imported"), "success");
      await runSessionCheck(profileId);
    } catch (e: any) {
      toast(extractError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const runSessionCheck = async (profileId: string) => {
    setBusyId(profileId);
    try {
      const data = await profilesService.sessionCheck(profileId);
      setSessionChecks((p) => ({ ...p, [profileId]: data }));
    } catch (e: any) {
      toast(extractError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const launchLogin = async (profileId: string) => {
    try {
      const data = await profilesService.launchLogin(profileId);
      toast(data.message ?? t("gateway.gw_profiles_launched_login"), "info");
    } catch (e: any) {
      toast(extractError(e), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Layers size={22} /> {t("gateway.gw_profiles_title")}
        </h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> {t("gateway.gw_profiles_create_btn")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_profiles_loading")}</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="space-y-3">
          {(profiles ?? []).map((p) => (
            <GatewayProfileCard
              key={p.id}
              profile={p}
              proxies={proxies ?? []}
              session={sessionChecks[p.id]}
              busy={busyId === p.id}
              onEdit={() => setEditing(p)}
              onDelete={() => confirm(t("gateway.gw_profiles_confirm_delete", { name: p.name })) && remove.mutate(p.id)}
              onUploadCookies={(file) => uploadCookies(p.id, file)}
              onSessionCheck={() => runSessionCheck(p.id)}
              onLaunchLogin={() => launchLogin(p.id)}
            />
          ))}
          {(profiles ?? []).length === 0 && (
            <div className="card text-center text-slate-500 py-10">
              {t("gateway.gw_profiles_empty")}
            </div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <GatewayProfileEditorModal
          profile={editing}
          isCreate={creating}
          proxies={proxies ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
