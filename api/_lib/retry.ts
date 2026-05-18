/**
 * Retry primitives condivisi tra endpoint /api/*. Logica generica isomorfica
 * (browser e Node 18+/Edge). Volutamente NON importato dal codice browser in
 * Fase 1 per evitare di accoppiare due trees diversi; se in futuro vorremo
 * convergere, questa è la home naturale.
 */

export const DEFAULT_BACKOFF_MS = [0, 1_000, 3_000] as const;
export const DEFAULT_JITTER_MS = 200;
export const DEFAULT_TIMEOUT_MS = 6_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export class TimeoutError extends Error {
    constructor(message = "operation timed out") {
        super(message);
        this.name = "TimeoutError";
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function backoffWithJitter(
    attemptIndex: number,
    schedule: ReadonlyArray<number> = DEFAULT_BACKOFF_MS,
    jitterMs: number = DEFAULT_JITTER_MS
): number {
    const base = schedule[attemptIndex] ?? schedule[schedule.length - 1] ?? 0;
    if (base === 0) return 0;
    const random = (Math.random() * 2 - 1) * jitterMs;
    return Math.max(0, base + random);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race<T>([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new TimeoutError()), ms);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
