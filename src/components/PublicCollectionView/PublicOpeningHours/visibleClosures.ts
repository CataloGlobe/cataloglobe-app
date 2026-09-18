import type { UpcomingClosure } from "./PublicOpeningHours";

/**
 * Le chiusure da MOSTRARE fra le prossime: da oggi in poi.
 *
 * Il payload ne porta una in più — quella di ieri — perché la coda notturna
 * di ieri è la mattina di oggi e il picker deve conoscerla (FASE 5.5,
 * `publicClosuresWindow`). È un dato per il calcolo, non una «prossima
 * chiusura»: qui si toglie prima di renderla. Un intervallo che finisce
 * oggi o dopo resta visibile.
 */
export function visibleClosures(closures: UpcomingClosure[], todayIso: string): UpcomingClosure[] {
    return closures.filter(c => (c.end_date ?? c.closure_date) >= todayIso);
}
