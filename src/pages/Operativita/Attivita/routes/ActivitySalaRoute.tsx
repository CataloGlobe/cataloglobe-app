import { PageGate } from "@/components/PageGate/PageGate";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import { useActivityDetail } from "../ActivityDetailContext";

/**
 * Sala: tavoli, zone e capienza. Rotta senza tab (§29.3): ci si arriva dai
 * rimandi di Ordini e prenotazioni. Si riorganizzerà in Servizio quando esisterà (§18).
 */
export default function ActivitySalaRoute() {
    const { activity, tenantId, reload, canManage, goToSection } = useActivityDetail();
    return (
        <PageGate readPermission="tables.read" activityId={activity.id}>
            {() => (
                // I tavoli servono a due domini: ordinazioni QR e prenotazioni.
                // Basta uno dei due abilitati per poterli mappare.
                // `orderingEnabled` resta il gate delle sole azioni QR.
                activity.ordering_enabled || activity.enable_reservations ? (
                    <TablesManagement
                        tenantId={tenantId}
                        activityId={activity.id}
                        orderingEnabled={activity.ordering_enabled}
                        reservationsEnabled={activity.enable_reservations}
                        reservationCapacity={activity.reservation_capacity}
                        reservationDurationMinutes={activity.reservation_duration_minutes}
                        reservationConfirmationMode={activity.reservation_confirmation_mode}
                        onActivityChanged={reload}
                        canManageActivity={canManage}
                    />
                ) : (
                    <TablesEmptyState
                        onGoToOrdering={() => goToSection("ordini-prenotazioni", "ordini")}
                        onGoToReservations={() => goToSection("ordini-prenotazioni", "prenotazioni")}
                    />
                )
            )}
        </PageGate>
    );
}
