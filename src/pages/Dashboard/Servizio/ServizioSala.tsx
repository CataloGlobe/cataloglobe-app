import { useNavigate } from "react-router-dom";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import type { V2Activity } from "@/types/activity";

interface ServizioSalaProps {
    tenantId: string;
    activity: V2Activity;
}

/**
 * Sala, il terzo modo di Servizio (Officina 3, versione 5 della Scheda:
 * «Sala passa in Servizio»): tavoli, zone, accostamenti e QR della sede. La
 * vede chi ha `tables.read` sulla sede, su ogni piano; modifica chi ha
 * `tables.manage` e un abbonamento attivo (lo decide `TablesManagement`).
 * `/sala`, i vecchi `?tab=sala` e `?modo=gestisci` portano qui.
 */
export function ServizioSala({ tenantId, activity }: ServizioSalaProps) {
    const navigate = useNavigate();
    const toScheda = (part: "ordini" | "prenotazioni") =>
        navigate({ pathname: "../anagrafica", search: `?parte=${part}` }, { relative: "path" });

    // I tavoli servono a due canali: ordini al tavolo e prenotazioni. Basta
    // uno dei due acceso per mapparli.
    if (!activity.ordering_enabled && !activity.enable_reservations) {
        return <TablesEmptyState onGoToOrdering={() => toScheda("ordini")} onGoToReservations={() => toScheda("prenotazioni")} />;
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
