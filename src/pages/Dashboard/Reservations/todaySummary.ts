import { todayIsoDate } from "@/utils/dateLocal";
import type { V2Reservation } from "@/types/reservation";

export type TodaySummary = {
    /** confirmed + seated + completed di oggi. */
    count: number;
    covers: number;
    /** Il prossimo arrivo confermato da adesso in poi, «HH:MM». */
    nextTime: string | null;
    /** pending in scope, scadute comprese. */
    pendingCount: number;
};

function nowHmm(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * I numeri di «Oggi» (lotto B-b), una regola sola per la striscia del
 * Servizio e la frase delle Prenotazioni (T14).
 *
 * Il conteggio è quello che il locale ha accettato e quello che è già
 * successo: `confirmed + seated + completed`, UN insieme per conteggio e
 * coperti. Fuori le `pending`, contate a parte come «da gestire»; dentro le
 * sedute, perché a fine serata «0 prenotazioni» sarebbe falso.
 */
export function summarizeToday(items: readonly V2Reservation[]): TodaySummary {
    const today = todayIsoDate();
    const now = nowHmm();
    let count = 0;
    let covers = 0;
    let nextTime: string | null = null;
    let pendingCount = 0;
    for (const r of items) {
        if (r.status === "pending") pendingCount += 1;
        if (r.reservation_date !== today) continue;
        if (r.status !== "confirmed" && r.status !== "seated" && r.status !== "completed") continue;
        count += 1;
        covers += r.party_size;
        const time = r.reservation_time.slice(0, 5);
        if (r.status === "confirmed" && time >= now && (nextTime === null || time < nextTime)) nextTime = time;
    }
    return { count, covers, nextTime, pendingCount };
}

/** «Prossimo arrivo alle 20:00» / «Nessun altro arrivo oggi» / «Nessuna prenotazione oggi». */
export function todayHeadline(s: TodaySummary): string {
    if (s.nextTime) return `Prossimo arrivo alle ${s.nextTime}`;
    return s.count > 0 ? "Nessun altro arrivo oggi" : "Nessuna prenotazione oggi";
}

/** «Oggi 4 prenotazioni · ~12 coperti · prossimo arrivo alle 20:00». */
export function todaySentence(s: TodaySummary): string {
    const parts = [
        `Oggi ${s.count} ${s.count === 1 ? "prenotazione" : "prenotazioni"}`,
        s.count > 0 ? `~${s.covers} coperti` : null,
        s.nextTime ? `prossimo arrivo alle ${s.nextTime}` : null
    ];
    return parts.filter(Boolean).join(" · ");
}
