import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { OrderStatus } from "@/types/orders";

/**
 * Nome e tono dello stato di una comanda, uno solo per tutte le superfici
 * (dettaglio comanda, dettaglio tavolo, card della board): le colonne della
 * board sono «Nuove · In lavorazione · Pronte», la comanda è «Nuova · In
 * lavorazione · Pronta». Toni uguali ai colori delle corsie (D141): azzurro,
 * ambra, verde.
 */
export function orderStatusBadge(status: OrderStatus): { variant: StatusBadgeVariant; label: string } {
    switch (status) {
        case "submitted":
            return { variant: "new", label: "Nuova" };
        case "acknowledged":
            return { variant: "warning", label: "In lavorazione" };
        case "ready":
            return { variant: "success", label: "Pronta" };
        case "delivered":
            return { variant: "neutral", label: "Servita" };
        case "cancelled":
            return { variant: "neutral", label: "Annullata" };
    }
}
