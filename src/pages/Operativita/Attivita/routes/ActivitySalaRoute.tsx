import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity } from "@/lib/permissions";
import { useActivityDetail } from "../ActivityDetailContext";

/**
 * Sala (correzioni UI SV3): tavoli, zone, accostamenti e QR della sede. Era
 * il modo «Gestisci la sala» di Servizio; ora è una tab della Scheda, con
 * gli stessi permessi: la vede chi ha `tables.read` sulla sede, modifica chi
 * ha `tables.manage` e un abbonamento attivo (lo decide `TablesManagement`).
 * `/sala` e i vecchi `?modo=gestisci` portano qui.
 */
export default function ActivitySalaRoute() {
    const { activity, tenantId, goToSection } = useActivityDetail();
    const { permissions } = usePermissions();

    if (permissions && !canDoOnActivity(permissions, "tables.read", activity.id)) {
        return (
            <EmptyState
                icon={<Lock size={40} strokeWidth={1.5} />}
                title="Non hai accesso a questa sezione"
                description="Contatta il proprietario o un amministratore per ottenere l'accesso."
            />
        );
    }

    // I tavoli servono a due canali: ordini al tavolo e prenotazioni. Basta
    // uno dei due acceso per mapparli.
    if (!activity.ordering_enabled && !activity.enable_reservations) {
        return (
            <TablesEmptyState
                onGoToOrdering={() => goToSection("anagrafica", undefined, "ordini")}
                onGoToReservations={() => goToSection("anagrafica", undefined, "prenotazioni")}
            />
        );
    }

    return (
        <TablesManagement
            tenantId={tenantId}
            activityId={activity.id}
            orderingEnabled={activity.ordering_enabled}
            reservationsEnabled={activity.enable_reservations}
        />
    );
}
