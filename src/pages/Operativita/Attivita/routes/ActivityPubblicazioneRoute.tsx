import { ActivitySettingsTab } from "../tabs/ActivitySettingsTab";
import { useActivityDetail } from "../ActivityDetailContext";

/** Pubblicazione (§31.1): come si raggiunge questo locale, e se è raggiungibile. */
export default function ActivityPubblicazioneRoute() {
    const { activity, tenantId, reload, canManage, canDelete } = useActivityDetail();
    return (
        <ActivitySettingsTab
            activity={activity}
            tenantId={tenantId}
            onReload={reload}
            canWrite={canManage}
            canDelete={canDelete}
        />
    );
}
