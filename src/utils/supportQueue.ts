/**
 * La coda di supporto della piattaforma in dati (ritocco R5): i filtri a chip
 * coi conteggi, i due gruppi («Aspettano voi» sopra) e da quanto aspetta ogni
 * richiesta. Puro: legge i ticket già caricati.
 */
import type { V2SupportTicketWithContext } from "@/types/support";

export type SupportQueueFilter = "da_gestire" | "aspettano_voi" | "aspettano_cliente" | "non_gestite" | "closed" | "all";

/**
 * I filtri in alto (D39, scelti da Alex il 2026-10-05, come nei Lead).
 * «Non gestite»: ancora «Aperta», nessuno l'ha presa in lavorazione.
 */
export const SUPPORT_QUEUE_FILTERS: { value: SupportQueueFilter; label: string }[] = [
    { value: "da_gestire", label: "Da gestire" },
    { value: "aspettano_voi", label: "Aspettano voi" },
    { value: "aspettano_cliente", label: "Aspettano il cliente" },
    { value: "non_gestite", label: "Non gestite" },
    { value: "closed", label: "Chiuse" },
    { value: "all", label: "Tutte" }
];

export const DEFAULT_SUPPORT_FILTER: SupportQueueFilter = "da_gestire";

/** Il filtro nell'indirizzo (`?filtro=`): elenco e richiesta restano allineati. */
export function supportFilterFrom(param: string | null): SupportQueueFilter {
    return SUPPORT_QUEUE_FILTERS.some(f => f.value === param) ? (param as SupportQueueFilter) : DEFAULT_SUPPORT_FILTER;
}

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
        case "aspettano_cliente":
            return t.status !== "closed" && !waitsForUs(t);
        case "non_gestite":
            return t.status === "open";
        case "closed":
            return t.status === "closed";
        case "all":
            return true;
    }
}

export function supportFilterCounts(tickets: Ticket[]): Record<SupportQueueFilter, number> {
    const counts = { da_gestire: 0, aspettano_voi: 0, aspettano_cliente: 0, non_gestite: 0, closed: 0, all: 0 };
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

/** L'elenco nell'ordine in cui si legge: i gruppi uno dopo l'altro. */
export function orderSupportQueue<T extends Ticket>(tickets: T[], filter: SupportQueueFilter): T[] {
    return groupSupportQueue(
        tickets.filter(t => matchesSupportFilter(t, filter)),
        filter
    ).flatMap(g => g.tickets);
}

/**
 * «Invia e passa alla prossima»: la prossima che aspetta voi dopo quella
 * aperta, dentro il filtro scelto (si ricomincia dall'alto); null se non ce
 * n'è un'altra.
 */
export function nextWaitingTicket<T extends Ticket & { id: string }>(ordered: T[], currentId: string): T | null {
    const at = ordered.findIndex(t => t.id === currentId);
    for (let step = 1; step <= ordered.length; step++) {
        const candidate = ordered[(Math.max(at, -1) + step + ordered.length) % ordered.length];
        if (candidate.id !== currentId && waitsForUs(candidate)) return candidate;
    }
    return null;
}

/**
 * Risposte pronte sopra il campo (Proposta 2 di D39): un clic mette il testo
 * nel campo, da ritoccare prima di inviare. Mai inviate da sole.
 */
export const SUPPORT_READY_REPLIES: { label: string; text: string }[] = [
    {
        label: "Ci guardiamo",
        text: "Ciao, grazie per averci scritto. Ci guardiamo subito e ti aggiorniamo qui appena abbiamo novità."
    },
    {
        label: "Serve un dettaglio",
        text: "Ciao, per capire meglio ci servirebbe un dettaglio in più: su quale sede succede e, se puoi, uno screenshot di quello che vedi."
    },
    {
        label: "Risolto",
        text: "Ciao, abbiamo sistemato. Prova di nuovo e dicci se adesso funziona: se va tutto bene chiudiamo la richiesta."
    },
    {
        label: "Chiudiamo",
        text: "Ciao, chiudiamo questa richiesta. Se serve altro scrivi pure qui: la richiesta si riapre da sola."
    }
];
