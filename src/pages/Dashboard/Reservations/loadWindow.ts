/**
 * La finestra di date che la pagina Prenotazioni chiede al server.
 *
 * FASE 5.2a: `listReservations` non scarica più l'intera tabella (PostgREST
 * tronca a 1000 righe, in ordine crescente: sparisce il futuro, in silenzio).
 * La pagina chiede SOLO le date che sta mostrando, e questo modulo dice
 * quali sono:
 *
 *   - la settimana dell'Agenda (lun–dom, `weekOffset` da oggi);
 *   - oggi, sempre (contatori in testa, scheda Servizio);
 *   - il giorno della prenotazione aperta nel drawer e quello scelto nel
 *     form, con il giorno prima e il giorno dopo — l'avviso di capienza
 *     ragiona sulle finestre di durata, che scavalcano la mezzanotte (stessa
 *     finestra `D-1 .. D+1` di `reservation_peak_with_candidate`).
 *
 * Le `pending` viaggiano a parte (`listPendingReservations`): la coda «Da
 * gestire» le mostra tutte, a qualunque data.
 *
 * Tutto puro: nessuna data «adesso» letta qui dentro, il chiamante passa
 * `todayIso`. Le date sono stringhe ISO locali (`YYYY-MM-DD`), confrontabili
 * come stringhe.
 */

import { addDays, shiftIsoDate } from "@/utils/dateLocal";
import type { ReservationDateRange, V2Reservation } from "@/types/reservation";

export type DateRange = ReservationDateRange;

function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoDateOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunedì della settimana (lun..dom) che contiene `d`. */
function mondayOf(d: Date): Date {
    const day = d.getDay(); // 0=dom..6=sab
    const shift = day === 0 ? -6 : 1 - day;
    return addDays(d, shift);
}

/**
 * Settimana dell'Agenda: lun–dom della settimana di `todayIso`, spostata di
 * `weekOffset` settimane. È la stessa regola con cui l'Agenda disegna la
 * griglia: se cambia qui deve cambiare lì, ed è per questo che l'Agenda la
 * importa da qui invece di ricalcolarla.
 */
export function agendaWeekRange(todayIso: string, weekOffset: number): DateRange {
    const start = addDays(mondayOf(parseLocalDate(todayIso)), weekOffset * 7);
    return { from: isoDateOf(start), to: isoDateOf(addDays(start, 6)) };
}

/** `D-1 .. D+1`: il contesto di capienza di un giorno. */
export function dayContextRange(iso: string): DateRange {
    return { from: shiftIsoDate(iso, -1), to: shiftIsoDate(iso, 1) };
}

/**
 * Unisce intervalli sovrapposti o adiacenti (il giorno dopo `to` è `from` di
 * un altro) e li ordina. Ogni intervallo risultante è una query: due
 * intervalli che si toccano sarebbero due query per lo stesso foglio.
 * Gli intervalli rovesciati (`from > to`) vengono scartati.
 */
export function mergeDateRanges(ranges: readonly DateRange[]): DateRange[] {
    const sorted = ranges
        .filter(r => r.from <= r.to)
        .slice()
        .sort((a, b) => a.from.localeCompare(b.from));
    const out: DateRange[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r.from <= shiftIsoDate(last.to, 1)) {
            if (r.to > last.to) last.to = r.to;
        } else {
            out.push({ from: r.from, to: r.to });
        }
    }
    return out;
}

function rangeContains(range: DateRange, iso: string): boolean {
    return iso >= range.from && iso <= range.to;
}

/**
 * Se una riga appartiene a ciò che la pagina ha in memoria: una `pending`
 * (la coda le ha tutte) o una data dentro una delle finestre caricate.
 * Serve al realtime per decidere se un evento va applicato o ignorato senza
 * ricaricare niente.
 */
export function isRowInWindow(
    row: Pick<V2Reservation, "status" | "reservation_date">,
    ranges: readonly DateRange[]
): boolean {
    if (row.status === "pending") return true;
    return ranges.some(r => rangeContains(r, row.reservation_date));
}

// ── Realtime ──────────────────────────────────────────────────────────────

/** Un evento `postgres_changes` su `reservations`, già ridotto all'essenziale. */
export type ReservationRealtimeEvent =
    | { type: "INSERT" | "UPDATE"; row: V2Reservation }
    | { type: "DELETE"; id: string };

export interface ApplyRealtimeResult {
    rows: V2Reservation[];
    /** Id ancora in memoria dopo gli eventi: le loro assegnazioni tavolo vanno rilette. */
    touchedIds: string[];
    /** Id usciti dalla memoria (cancellati o finiti fuori finestra). */
    removedIds: string[];
}

function compareByDateTime(a: V2Reservation, b: V2Reservation): number {
    if (a.reservation_date !== b.reservation_date) {
        return a.reservation_date.localeCompare(b.reservation_date);
    }
    return a.reservation_time.localeCompare(b.reservation_time);
}

/**
 * Applica una raffica di eventi realtime alle righe in memoria SENZA
 * ricaricare la finestra: una riga dentro la finestra (o `pending`) viene
 * inserita o sostituita, una riga fuori viene tolta (era dentro, si è
 * spostata; o era `pending`, è stata decisa per una data che non mostriamo).
 * L'ordine resta data + ora, lo stesso del server. Puro: non muta `rows`.
 */
export function applyRealtimeEvents(
    rows: readonly V2Reservation[],
    events: readonly ReservationRealtimeEvent[],
    ranges: readonly DateRange[]
): ApplyRealtimeResult {
    const byId = new Map(rows.map(r => [r.id, r]));
    const touched = new Set<string>();
    const removed = new Set<string>();

    for (const e of events) {
        if (e.type === "DELETE") {
            if (byId.delete(e.id)) removed.add(e.id);
            touched.delete(e.id);
            continue;
        }
        if (isRowInWindow(e.row, ranges)) {
            byId.set(e.row.id, e.row);
            touched.add(e.row.id);
            removed.delete(e.row.id);
        } else if (byId.delete(e.row.id)) {
            removed.add(e.row.id);
            touched.delete(e.row.id);
        }
    }

    return {
        rows: Array.from(byId.values()).sort(compareByDateTime),
        touchedIds: Array.from(touched),
        removedIds: Array.from(removed)
    };
}
