/**
 * La ricerca di una prenotazione per nome o per telefono (FASE 5.2b).
 *
 * La pagina Prenotazioni tiene in memoria una settimana: cercare lì dentro
 * mentirebbe («Rossi» non c'è → «non ha prenotato», mentre ha un tavolo a
 * marzo). La ricerca è quindi una query sua, su tutte le date, e questo
 * modulo contiene la parte PURA: come si legge ciò che l'operatore ha
 * digitato, come si confronta un telefono, come si ordinano i risultati.
 * Niente rete, niente date «adesso»: il chiamante passa `todayIso`.
 *
 * Il telefono si confronta SOLO per cifre e per suffisso: chi cerca digita
 * `3331234567`, in tabella c'è `+393331234567` in `customer_phone_e164` o
 * `3331234567` nel campo libero. Nessun indice e nessuna migration: a queste
 * dimensioni non servono. I numeri scritti con spazi e SENZA e164 non sono
 * cercabili: vedi il commento sopra `searchReservations`.
 */

import type { V2Reservation } from "@/types/reservation";

/** Sotto questa lunghezza un nome non si cerca: sarebbe rumore. */
export const SEARCH_MIN_LENGTH = 2;

/**
 * Un telefono si cerca da quattro cifre: con meno, il `like` per suffisso
 * pesca troppe righe e il tetto dei risultati scatta su quelle sbagliate
 * (vedi il difetto documentato sopra `searchReservations`).
 */
export const SEARCH_PHONE_MIN_DIGITS = 4;

/**
 * Tetto dei risultati mostrati. Come per la coda «Da gestire», la query non
 * è mai illimitata: oltre il tetto la pagina lo dice, non finge.
 */
export const SEARCH_RESULTS_LIMIT = 50;

/** Solo le cifre: `+39 333 123-4567` → `393331234567`. */
export function phoneDigits(raw: string | null | undefined): string {
    return (raw ?? "").replace(/\D/g, "");
}

export type SearchQuery =
    | { kind: "phone"; digits: string }
    | { kind: "name"; text: string };

/**
 * Cosa ha digitato l'operatore. Un testo fatto di sole cifre (con spazi,
 * `+`, trattini, punti, parentesi ammessi) è un telefono; tutto il resto è
 * un nome. `null` se troppo corto per valere una richiesta al server: due
 * caratteri per un nome, quattro cifre per un telefono.
 */
export function parseSearchQuery(input: string): SearchQuery | null {
    const text = input.trim();
    if (text.length < SEARCH_MIN_LENGTH) return null;
    if (/^[\d\s+\-().]+$/.test(text)) {
        const digits = phoneDigits(text);
        return digits.length >= SEARCH_PHONE_MIN_DIGITS ? { kind: "phone", digits } : null;
    }
    return { kind: "name", text };
}

/**
 * Il confronto vero del telefono, sul client: cifre digitate come suffisso
 * delle cifre salvate, in uno dei due campi. Il server fa un `like` per
 * suffisso sui due campi così come sono; la parola finale è questa.
 */
export function phoneMatches(
    row: Pick<V2Reservation, "customer_phone" | "customer_phone_e164">,
    digits: string
): boolean {
    if (digits.length === 0) return false;
    return (
        phoneDigits(row.customer_phone).endsWith(digits) ||
        phoneDigits(row.customer_phone_e164).endsWith(digits)
    );
}

/**
 * Il nome, ripulito dai caratteri che PostgREST riserva nella sintassi di
 * `or=(...)` e da quelli che LIKE legge come jolly. Nessuno li cerca in un
 * cognome; toglierli è più onesto di un escaping a due livelli.
 */
export function sanitizeNameQuery(text: string): string {
    return text.replace(/[%_,()"\\]/g, "").trim();
}

function daysBetween(fromIso: string, toIso: string): number {
    const parse = (iso: string) => {
        const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
        return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    };
    return Math.round((parse(toIso) - parse(fromIso)) / 86_400_000);
}

/** Distanza in giorni da oggi, senza segno. */
export function distanceFromToday(row: Pick<V2Reservation, "reservation_date">, todayIso: string): number {
    return Math.abs(daysBetween(todayIso, row.reservation_date));
}

/**
 * Ordina dalla più vicina a oggi: a parità di distanza prima il futuro (la
 * prenotazione che si cerca è quasi sempre quella che deve ancora
 * arrivare), poi per ora. Puro: non muta l'input.
 */
export function sortByProximity<T extends Pick<V2Reservation, "reservation_date" | "reservation_time">>(
    rows: readonly T[],
    todayIso: string
): T[] {
    return rows.slice().sort((a, b) => {
        const da = distanceFromToday(a, todayIso);
        const db = distanceFromToday(b, todayIso);
        if (da !== db) return da - db;
        if (a.reservation_date !== b.reservation_date) {
            // Stessa distanza, date diverse: la più avanti è il futuro.
            return b.reservation_date.localeCompare(a.reservation_date);
        }
        return a.reservation_time.localeCompare(b.reservation_time);
    });
}
