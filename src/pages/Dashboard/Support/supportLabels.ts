// Presentazione dello stato di un ticket di supporto.
//
// Vive fuori dai componenti perché lista e dettaglio devono mostrare lo stesso
// badge per lo stesso stato: due mappe separate divergerebbero al primo
// ritocco. I valori DB restano in inglese (convenzione di `activities.status`
// e `orders.status`), la UI è italiana.

import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { SupportTicketStatus } from "@/types/support";

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
    open: "Aperta",
    in_progress: "In lavorazione",
    closed: "Chiusa"
};

// `pending` per 'open': la richiesta è dal lato cliente in attesa di risposta.
// `info` per 'in_progress': qualcuno ci sta lavorando. `neutral` per 'closed':
// niente verde — una richiesta chiusa non è un successo da celebrare, è una
// conversazione finita.
export const SUPPORT_STATUS_VARIANT: Record<SupportTicketStatus, StatusBadgeVariant> = {
    open: "pending",
    in_progress: "info",
    closed: "neutral"
};
