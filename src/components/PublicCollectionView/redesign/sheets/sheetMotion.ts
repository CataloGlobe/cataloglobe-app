/**
 * Tempi e decisioni di movimento dei fogli della pagina pubblica. Pure, senza
 * DOM: le costanti stanno qui per testarle e perché la spec le fissa (spinta
 * 340 ms) — `SheetHost` le usa e basta.
 */
export const PUSH_DURATION_MS = 340;
export const ENTER_DURATION_MS = 320;
export const EXIT_DURATION_MS = 260;
export const EXIT_MIN_DURATION_MS = 140;
export const SHEET_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Trascinamento oltre questa distanza (px) chiude il foglio. */
export const DISMISS_DISTANCE_PX = 120;
/** Un colpo verso il basso più veloce di così (px/ms) chiude anche da vicino. */
export const DISMISS_VELOCITY_PX_MS = 0.6;

export function shouldDismissOnRelease(distancePx: number, velocityPxMs: number): boolean {
    if (distancePx <= 0) return false;
    return distancePx >= DISMISS_DISTANCE_PX || velocityPxMs >= DISMISS_VELOCITY_PX_MS;
}

/**
 * Durata dell'uscita dopo un trascinamento: un colpo veloce chiude in
 * proporzione alla velocità del gesto, un rilascio lento usa la durata base.
 */
export function exitDuration(remainingPx: number, velocityPxMs: number): number {
    if (velocityPxMs <= 0) return EXIT_DURATION_MS;
    const ms = remainingPx / velocityPxMs;
    return Math.round(Math.min(EXIT_DURATION_MS, Math.max(EXIT_MIN_DURATION_MS, ms)));
}

/** Traslazione orizzontale (in %) della pista di pagine per la pagina attiva. */
export function trackOffsetPercent(activeIndex: number): number {
    return -100 * Math.max(0, activeIndex);
}
