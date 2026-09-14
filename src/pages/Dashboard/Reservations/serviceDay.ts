/**
 * ⚠️ SYNC — regola di dominio duplicata SQL ↔ TS.
 *
 * La giornata di SERVIZIO della sala: inizia alle cinque del mattino
 * (Europe/Rome), non a mezzanotte. Una tavolata aperta prima dell'ultima
 * cinque trascorsa appartiene a un servizio passato.
 *
 * La stessa regola vive lato SQL in `public.get_service_day_start()`
 * (migration `20260914155000`), dove la legge il cron che CHIUDE le tavolate
 * rimaste indietro (`close_stale_seatings`). Qui la legge la schermata
 * Servizio che le SEGNALA. Devono coincidere: se il segnale e la chiusura
 * leggessero due confini, alle 00:30 uno direbbe "servizio precedente" e
 * l'altro no. Cambiare `SERVICE_DAY_START_HOUR` qui e non lì (o viceversa)
 * è esattamente quella divergenza: modificarli nello stesso commit, come
 * `priceSummary.ts` e `scheduleResolver.ts`.
 *
 * ── Perché non la mezzanotte ────────────────────────────────────────────────
 * `get_operative_day_start()` / la data locale sono la giornata di
 * CALENDARIO: giusta per KPI, promemoria, Storico. La sala non finisce a
 * mezzanotte: un locale che chiude alle 02:00 ha, alle 00:30, tavolate vive.
 * Le cinque sono l'ora in cui, in Italia e in questo settore, non c'è più
 * nessuno.
 *
 * ── Il numero ───────────────────────────────────────────────────────────────
 * L'unico valore inventato della FASE 2.8, in un posto solo per lato.
 * Nessuna impostazione per sede finché non esiste un locale reale che serve
 * oltre le cinque: quel giorno diventa una colonna su `activities` con 5
 * come default, e questo modulo la riceve come parametro.
 *
 * ── Il calcolo ──────────────────────────────────────────────────────────────
 * "Sposta l'orologio di Roma indietro di 5 ore e prendi la data": è la
 * giornata di servizio a cui un istante appartiene. Due istanti stanno nello
 * stesso servizio se hanno la stessa data così ottenuta; "prima dell'ultima
 * cinque trascorsa" ⇔ giornata di servizio dell'apertura < giornata di
 * servizio di adesso. Nessun confronto di istanti assoluti e nessuna
 * mezzanotte locale del browser: la data si legge in Europe/Rome via Intl,
 * stessa tecnica di `toRomeDateTime` (schedulingNow.ts).
 *
 * TODO multi-region: fuso da `activities.iana_timezone` quando esisterà.
 */

import { RESERVATION_TIMEZONE } from "./reminderStatus";

/** Ora (Europe/Rome) in cui inizia la giornata di servizio. SYNC con SQL. */
export const SERVICE_DAY_START_HOUR = 5;

const romeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
});

/**
 * "YYYY-MM-DD" della giornata di servizio a cui `instant` appartiene, oppure
 * `null` se l'istante non è leggibile. Un dato rotto non deve produrre un
 * segnale (stesso criterio di `isLateArrival`).
 *
 * Lo spostamento di 5 ore è fatto sull'OROLOGIO DI ROMA, non sull'istante:
 * è ciò che fa la SQL (`(now() AT TIME ZONE 'Europe/Rome') - interval '5
 * hours'`). Spostare l'istante e poi leggere la data di Roma darebbe un
 * risultato diverso nell'ora a cavallo del cambio d'ora — e il segnale
 * divergerebbe dalla chiusura proprio la notte in cui nessuno guarda.
 */
export function serviceDayOf(instant: Date): string | null {
    if (Number.isNaN(instant.getTime())) return null;
    const parts = romeParts.formatToParts(instant);
    const read = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const year = read("year");
    const month = read("month");
    const day = read("day");
    const hour = read("hour");
    if ([year, month, day, hour].some(Number.isNaN)) return null;
    // Data di Roma, come giorno UTC "finto" per fare aritmetica di calendario
    // senza fuso: prima delle cinque si è ancora nel servizio di ieri.
    const civil = Date.UTC(year, month - 1, day);
    const serviceDay = new Date(hour < SERVICE_DAY_START_HOUR ? civil - 86_400_000 : civil);
    return serviceDay.toISOString().slice(0, 10);
}

/**
 * True se `openedAt` cade in una giornata di servizio precedente a quella
 * di `now`: cioè prima dell'ultima cinque del mattino trascorsa.
 *
 * Le cinque righe della specifica (aperta / adesso):
 *   ieri 21:00 / 00:30 → false   oggi 01:00 / 03:00 → false
 *   ieri 21:00 / 06:00 → true    oggi 01:00 / 06:00 → true
 *   oggi 07:00 / 12:00 → false
 */
export function isFromPreviousServiceDay(openedAt: string, now: Date): boolean {
    const opened = serviceDayOf(new Date(openedAt));
    const current = serviceDayOf(now);
    if (opened === null || current === null) return false;
    return opened < current;
}
