import { ActivityProfileTab } from "../tabs/ActivityProfileTab";
import { useActivityDetail } from "../ActivityDetailContext";

/** Anagrafica (§31.1): chi è questo locale. */
export default function ActivityAnagraficaRoute() {
    const { activity, tenantId, reload, canManage } = useActivityDetail();
    return <ActivityProfileTab activity={activity} tenantId={tenantId} onReload={reload} canWrite={canManage} />;
}
