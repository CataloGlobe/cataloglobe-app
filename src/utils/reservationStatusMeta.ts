// Etichetta + variante badge per lo stato di una prenotazione.
//
// Estratto da ReservationDetailDrawer quando la rubrica clienti ha avuto
// bisogno delle stesse etichette nello storico visite: due mappe separate
// sarebbero divergute alla prima aggiunta di stato.
//
// `statusMetaLoose` accetta qualunque stringa: lo storico legge da una view e
// non deve rompersi su un valore che il tipo TS non conosce ancora.

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
        case "seated":    return { variant: "success", label: "Al tavolo" };
        case "completed": return { variant: "neutral", label: "Completata" };
        case "declined":  return { variant: "neutral", label: "Rifiutata" };
        case "cancelled": return { variant: "neutral", label: "Annullata" };
        case "no_show":   return { variant: "neutral", label: "Non presentato" };
    }
}

export function statusMetaLoose(status: string): ReservationStatusMeta {
    switch (status) {
        case "pending":
        case "confirmed":
        case "seated":
        case "completed":
        case "declined":
        case "cancelled":
        case "no_show":
            return statusMeta(status);
        default:          return { variant: "neutral", label: status };
    }
}
