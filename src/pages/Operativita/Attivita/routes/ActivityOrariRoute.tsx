import { ActivityHoursTab } from "../tabs/ActivityHoursTab";
import { useActivityDetail } from "../ActivityDetailContext";

/** Orari (§31.1): settimana e chiusure straordinarie. */
export default function ActivityOrariRoute() {
    const { activity, tenantId, reload, hours, isHoursLoading, loadHours, canManageHours } = useActivityDetail();
    return (
        <ActivityHoursTab
            activity={activity}
            tenantId={tenantId}
            hours={hours}
            isHoursLoading={isHoursLoading}
            onHoursChanged={loadHours}
            onReload={reload}
            canManageHours={canManageHours}
        />
    );
}
