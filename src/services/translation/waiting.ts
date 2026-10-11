/**
 * Minuti che mancano alla partenza di una traduzione in attesa (`run_after`),
 * arrotondati per eccesso e mai sotto 1: «tra 1 min» anche negli ultimi
 * secondi, finché il cron non la prende.
 */
export function minutesUntil(runAfter: string, now: number = Date.now()): number {
    const ms = Date.parse(runAfter) - now;
    return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * Fra delle lingue con stato, quanto aspettare prima di ricaricare per vedere
 * partire la prima in attesa: poco dopo il suo `runAfter` (il cron la prende
 * entro 30 s), mai sotto 5 s. null se nessuna è in attesa.
 */
export function waitingRefetchDelayMs(
    states: ReadonlyArray<{ state: string; runAfter?: string }> | null | undefined,
    now: number = Date.now()
): number | null {
    let earliest: number | null = null;
    for (const s of states ?? []) {
        if (s.state !== "waiting" || !s.runAfter) continue;
        const at = Date.parse(s.runAfter);
        if (earliest === null || at < earliest) earliest = at;
    }
    if (earliest === null) return null;
    return Math.max(earliest - now + 5000, 5000);
}
