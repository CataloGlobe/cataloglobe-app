/**
 * La coda di supporto della piattaforma in dati (ritocco R5): i filtri a chip
 * coi conteggi, i due gruppi («Aspettano voi» sopra) e da quanto aspetta ogni
 * richiesta. Puro: legge i ticket già caricati.
 */
import type { V2SupportTicketWithContext } from "@/types/support";

export type SupportQueueFilter = "da_gestire" | "aspettano_voi" | "open" | "in_progress" | "closed" | "all";

export const SUPPORT_QUEUE_FILTERS: { value: SupportQueueFilter; label: string }[] = [
    { value: "da_gestire", label: "Da gestire" },
    { value: "aspettano_voi", label: "Aspettano voi" },
    { value: "open", label: "Aperte" },
    { value: "in_progress", label: "In lavorazione" },
    { value: "closed", label: "Chiuse" },
    { value: "all", label: "Tutte" }
];

type Ticket = Pick<V2SupportTicketWithContext, "status" | "last_message_kind" | "last_message_at">;

/** L'ultima parola è del cliente e la richiesta non è chiusa: tocca a voi. */
export function waitsForUs(t: Ticket): boolean {
    return t.status !== "closed" && t.last_message_kind === "customer";
}

export function matchesSupportFilter(t: Ticket, filter: SupportQueueFilter): boolean {
    switch (filter) {
        case "da_gestire":
            return t.status !== "closed";
        case "aspettano_voi":
            return waitsForUs(t);
        case "all":
            return true;
        default:
            return t.status === filter;
    }
}

export function supportFilterCounts(tickets: Ticket[]): Record<SupportQueueFilter, number> {
    const counts = { da_gestire: 0, aspettano_voi: 0, open: 0, in_progress: 0, closed: 0, all: 0 };
    for (const t of tickets) {
        for (const f of SUPPORT_QUEUE_FILTERS) if (matchesSupportFilter(t, f.value)) counts[f.value] += 1;
    }
    return counts;
}

export interface SupportQueueGroup<T> {
    title: string;
    tickets: T[];
}

/**
 * Due gruppi: «Aspettano voi» sopra, il resto sotto. Il resto si chiama
 * «Aspettano il cliente» finché la vista non contiene chiuse.
 */
export function groupSupportQueue<T extends Ticket>(tickets: T[], filter: SupportQueueFilter): SupportQueueGroup<T>[] {
    const ours = tickets.filter(waitsForUs);
    const rest = tickets.filter(t => !waitsForUs(t));
    const groups: SupportQueueGroup<T>[] = [];
    if (ours.length > 0) groups.push({ title: "Aspettano voi", tickets: ours });
    if (rest.length > 0) {
        const withClosed = filter === "closed" || filter === "all";
        groups.push({ title: withClosed ? "Le altre" : "Aspettano il cliente", tickets: rest });
    }
    return groups;
}

/** Oltre quest'attesa una richiesta che tocca a voi si legge in arancione. */
export const SUPPORT_LATE_HOURS = 4;

export function supportWaitIsLate(t: Ticket, now: Date): boolean {
    return waitsForUs(t) && now.getTime() - new Date(t.last_message_at).getTime() > SUPPORT_LATE_HOURS * 3_600_000;
}
