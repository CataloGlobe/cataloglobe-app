// Il drawer della tavolata: quale si apre, cosa si può fare, come si legge
// una tavolata che non ha un nome.
//
// Logica pura e fuori dal JSX apposta: sono regole, e le regole si testano.
// Stesso criterio di `serviceBoard.ts` e `seatingActions.ts`.

import {
    compareTableLabels,
    formatTableLabels
} from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { SeatingStatus, SeatingWithState } from "@/types/seating";

// ─────────────────────────────────────────────────────────────────────────────
// Quale drawer
// ─────────────────────────────────────────────────────────────────────────────

export type SeatingDrawerTarget = "reservation" | "seating";

/**
 * Due drawer, un criterio: si apre quello dell'entità che ha più da dire.
 *
 * Una tavolata con prenotazione apre il drawer della PRENOTAZIONE: lì ci sono
 * il cliente, i contatti, il promemoria, la storia — e la tavolata è la
 * sezione TAVOLO nella forma `seated`. Un walk-in non ha niente di tutto
 * questo: la tavolata è tutto ciò che esiste, e riceve un drawer suo.
 *
 * Con più prenotazioni si apre la prima (in ordine di orario, come le
 * aggrega la view); i singoli nomi nella riga restano scorciatoie verso
 * ciascuna.
 */
export function seatingDrawerFor(
    seating: Pick<SeatingWithState, "reservations">
): SeatingDrawerTarget {
    return seating.reservations.length > 0 ? "reservation" : "seating";
}

// ─────────────────────────────────────────────────────────────────────────────
// Quali gesti
// ─────────────────────────────────────────────────────────────────────────────

export type SeatingDrawerActionKey =
    /** Il servizio è finito: chiude e CONSERVA. */
    | "complete"
    /** "Ho premuto per sbaglio": cancella, non è mai successo. */
    | "undo";

export interface SeatingDrawerInput {
    status: SeatingStatus;
    /** `canDoOnActivity(perms, 'seatings.manage', activityId)`. */
    canManageSeatings: boolean;
}

/**
 * I gesti disponibili, nell'ordine in cui vanno letti (mai disegnati: il
 * footer deve tenere `undo` e `complete` agli estremi opposti, come nel
 * drawer della prenotazione — dicono cose opposte, e la posizione deve
 * dirlo).
 *
 * Senza permesso: nessun gesto, non disegnati. Su `closed`: nessun gesto,
 * il servizio si è svolto e riaprirlo è un'operazione che non esiste.
 */
export function seatingDrawerActionsFor({
    status,
    canManageSeatings
}: SeatingDrawerInput): SeatingDrawerActionKey[] {
    if (!canManageSeatings) return [];
    if (status === "open") return ["complete", "undo"];
    return [];
}

/**
 * Tavoli e coperti si cambiano solo su una tavolata aperta, e solo con il
 * permesso. Su `closed` sono storia: la RPC li rifiuta con 22023, e
 * l'interfaccia non offre il gesto — un bottone che fallisce è peggio
 * dell'assenza del bottone.
 */
export function canEditSeating({ status, canManageSeatings }: SeatingDrawerInput): boolean {
    return canManageSeatings && status === "open";
}

// ─────────────────────────────────────────────────────────────────────────────
// Come si legge una tavolata senza nome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per un walk-in i tavoli SONO il nome: è così che un host ne parla — non
 * "il tavolo di nessuno", ma "il sette". Niente nomi finti ("Senza nome",
 * "Cliente occasionale", "Walk-in #3"): un nome inventato si legge come un
 * dato, e non lo è.
 *
 * `null` = nessun tavolo: è ammesso, ed è una tavolata di cui davvero si sa
 * poco. La riga vive di coperti e durata, e va bene che sembri scarna.
 */
export function walkinTitle(seating: Pick<SeatingWithState, "tables">): string | null {
    if (seating.tables.length === 0) return null;
    const labels = seating.tables.map(t => t.label).sort(compareTableLabels);
    return formatTableLabels(labels);
}

/** "4 coperti" · "1 coperto" · `null` quando non indicati (NULL sulla riga). */
export function formatCovers(n: number | null): string | null {
    if (n === null) return null;
    return `${n} ${n === 1 ? "coperto" : "coperti"}`;
}

/**
 * "da poco" · "da 45 min" · "da 1 h" · "da 1 h 20 min" · "da 1 giorno" ·
 * "da 2 giorni".
 *
 * Oltre le 24 ore i minuti non dicono più niente: "da 53 h 1 min" è un
 * numero da leggere, "da 2 giorni" è un fatto. Giorni interi, troncati: una
 * tavolata aperta da 47 ore è "da 1 giorno", e la riga di segnale (2.8) dice
 * già che è di un servizio precedente — qui si dice solo da quanto.
 */
export function formatOpenFor(openedAtIso: string, now: Date): string {
    const ms = now.getTime() - new Date(openedAtIso).getTime();
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 1) return "da poco";
    if (totalMin < 60) return `da ${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    if (h >= 24) {
        const d = Math.floor(h / 24);
        return d === 1 ? "da 1 giorno" : `da ${d} giorni`;
    }
    const m = totalMin % 60;
    return m === 0 ? `da ${h} h` : `da ${h} h ${m} min`;
}
