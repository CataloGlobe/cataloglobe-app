import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ActivityOrderingTab } from "../tabs/ActivityOrderingTab";
import { ActivityReservationsTab } from "../tabs/ActivityReservationsTab";
import { useActivityDetail } from "../ActivityDetailContext";

/**
 * Canali (§31.1): cosa può fare un cliente da questo locale. Ordini al
 * tavolo e prenotazioni restano due sezioni distinte, con le ancore
 * `#ordini` e `#prenotazioni` a cui puntano i vecchi `?tab=`.
 */
export default function ActivityCanaliRoute() {
    const { activity, tenantId, reload, canManage, hours, isHoursLoading, legalName } = useActivityDetail();
    const { hash } = useLocation();

    // L'ancora arriva prima del contenuto (la sede si legge dopo il mount):
    // lo scroll si fa a mano quando la sezione esiste.
    useEffect(() => {
        if (!hash) return;
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    }, [hash, activity.id]);
    return (
        <>
            <section id="ordini" aria-label="Ordini al tavolo">
                <ActivityOrderingTab activity={activity} tenantId={tenantId} onReload={reload} canWrite={canManage} />
            </section>
            <section id="prenotazioni" aria-label="Prenotazioni">
                <ActivityReservationsTab
                    activity={activity}
                    tenantId={tenantId}
                    onReload={reload}
                    canWrite={canManage}
                    hours={hours}
                    isHoursLoading={isHoursLoading}
                    legalName={legalName}
                />
            </section>
        </>
    );
}
