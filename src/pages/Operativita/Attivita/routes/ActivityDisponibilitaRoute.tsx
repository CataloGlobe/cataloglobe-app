import { ActivityAvailabilityTab } from "../tabs/ActivityAvailabilityTab";
import { useActivityDetail } from "../ActivityDetailContext";

/**
 * Disponibilità: cosa trova chi inquadra il QR di questa sede, adesso.
 * Rotta senza tab; diventerà «Cosa vedono i clienti» con la milestone 7 (§19).
 */
export default function ActivityDisponibilitaRoute() {
    const { activity, tenantId, reload } = useActivityDetail();
    return <ActivityAvailabilityTab activity={activity} tenantId={tenantId} onReload={reload} />;
}
