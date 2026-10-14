/** Secondi in cui «Chiama il cameriere» resta spento dopo una chiamata (come `call-waiter`). */
export const WAITER_COOLDOWN_S = 60;
/**
 * Fin quando il cliente vede «Cameriere chiamato» se la sala non lo segna arrivato:
 * oltre, la chiamata è vecchia e il riquadro torna com'era.
 */
export const WAITER_CALLED_SHOWN_S = 600;

/**
 * - `idle`: nessuna chiamata aperta, «Chiama il cameriere».
 * - `called`: appena chiamato, pulsante spento, «Arriva a breve».
 * - `recall`: chiamato da più di un minuto e la sala non l'ha ancora segnato arrivato:
 *   si può richiamare.
 */
export type WaiterPhase = "idle" | "called" | "recall";

export function waiterPhase(waiterCalledAt: string | null, nowMs: number): WaiterPhase {
    if (!waiterCalledAt) return "idle";
    const calledMs = Date.parse(waiterCalledAt);
    if (!Number.isFinite(calledMs)) return "idle";
    const elapsedS = (nowMs - calledMs) / 1000;
    if (elapsedS < WAITER_COOLDOWN_S) return "called";
    if (elapsedS < WAITER_CALLED_SHOWN_S) return "recall";
    return "idle";
}

/** Millisecondi al prossimo cambio di fase, `null` se non cambia più da sola. */
export function msToNextWaiterPhase(waiterCalledAt: string | null, nowMs: number): number | null {
    if (!waiterCalledAt) return null;
    const calledMs = Date.parse(waiterCalledAt);
    if (!Number.isFinite(calledMs)) return null;
    const elapsedMs = nowMs - calledMs;
    if (elapsedMs < WAITER_COOLDOWN_S * 1000) return WAITER_COOLDOWN_S * 1000 - elapsedMs;
    if (elapsedMs < WAITER_CALLED_SHOWN_S * 1000) return WAITER_CALLED_SHOWN_S * 1000 - elapsedMs;
    return null;
}
