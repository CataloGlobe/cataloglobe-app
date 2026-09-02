// Etichetta + variante badge per lo stato di una prenotazione.
//
// Estratto da ReservationDetailDrawer quando la rubrica clienti ha avuto
// bisogno delle stesse etichette nello storico visite: due mappe separate
// sarebbero divergute alla prima aggiunta di stato.
//
// `statusMetaLoose` accetta anche gli stati che il CHECK del DB ammette ma che
// oggi nessuno scrive (`seated`, `completed`): lo storico legge da una view e
// non deve rompersi se un giorno qualcuno inizia a usarli.

import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { ReservationStatus } from "@/types/reservation";

export interface ReservationStatusMeta {
    variant: StatusBadgeVariant;
    label: string;
}

export function statusMeta(status: ReservationStatus): ReservationStatusMeta {
    switch (status) {
        case "pending":   return { variant: "warning", label: "Da gestire" };
        case "confirmed": return { variant: "success", label: "Confermata" };
        case "declined":  return { variant: "neutral", label: "Rifiutata" };
        case "cancelled": return { variant: "neutral", label: "Annullata" };
        case "no_show":   return { variant: "neutral", label: "Non presentato" };
    }
}

export function statusMetaLoose(status: string): ReservationStatusMeta {
    switch (status) {
        case "pending":
        case "confirmed":
        case "declined":
        case "cancelled":
        case "no_show":
            return statusMeta(status);
        case "seated":    return { variant: "success", label: "Al tavolo" };
        case "completed": return { variant: "neutral", label: "Completata" };
        default:          return { variant: "neutral", label: status };
    }
}
