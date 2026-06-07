/**
 * Retry/timeout helper per le query di auth/OTP check.
 *
 * Estratto da AuthProvider per testabilità: non importa nulla da React o
 * Supabase, accetta una factory generica e tutte le dipendenze (sleep) come
 * opzioni.
 */

export class TimeoutError extends Error {
    constructor() {
        super("auth: attempt timeout");
        this.name = "TimeoutError";
    }
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race<T>([
            p,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new TimeoutError()), ms);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504]);

export function isRetryable(err: unknown): boolean {
    if (err instanceof TimeoutError) return true;
    const e = err as { name?: string; message?: string; status?: number; code?: string };
    // supabase-js auth: AuthRetryableFetchError → blip transient lato auth.
    if (e?.name === "AuthRetryableFetchError") return true;
    if (e?.name === "TypeError" && /fetch|network/i.test(e.message ?? "")) return true;
    // PostgrestError (supabase-js) NON espone .status, ma codici PGRST* sono
    // deterministici (RLS / not-found / parsing) → no retry.
    if (typeof e?.code === "string" && e.code.startsWith("PGRST")) return false;
    // .status check defensive: postgrest-js non lo setta, ma copre altri error
    // shape (es. fetch Response, supabase.auth errors).
    if (typeof e?.status === "number" && RETRYABLE_STATUS.has(e.status)) return true;
    return false;
}

export type RetryOptions = {
    /** Backoff base in ms per ciascun tentativo. Esempio: [0, 800] = primo
     *  tentativo immediato, secondo dopo 800ms. La lunghezza dell'array =
     *  numero massimo di tentativi. */
    schedule: readonly number[];
    /** Timeout per il singolo tentativo. */
    perAttemptTimeoutMs: number;
    /** Budget totale dall'inizio del check (startedAt). Se il budget è
     *  esaurito PRIMA di un tentativo, il loop esce con budgetExhausted=true.
     *  Il singolo attempt corrente NON è interrotto a metà — il timeout
     *  per-attempt è la garanzia. */
    totalBudgetMs: number;
    /** Reference time per il calcolo del budget. Tipicamente Date.now()
     *  catturato all'inizio del check. */
    startedAt: number;
    /** Jitter ±ms applicato al backoff (escluso il tentativo immediato). */
    jitterMs?: number;
    /** Hook iniettabile per il test (consente fake-timer-less testing). */
    sleep?: (ms: number) => Promise<void>;
    /** Override del classificatore (default: isRetryable esportato). */
    isRetryable?: (err: unknown) => boolean;
};

export type RetryResult<T> =
    | { ok: true; value: T; attempts: number }
    | { ok: false; error: unknown; attempts: number; budgetExhausted: boolean };

export async function runWithRetry<T>(
    factory: () => Promise<T>,
    opts: RetryOptions
): Promise<RetryResult<T>> {
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const classify = opts.isRetryable ?? isRetryable;
    const jitterMs = opts.jitterMs ?? 0;

    let lastErr: unknown = undefined;
    let attempts = 0;
    let budgetExhausted = false;

    for (let i = 0; i < opts.schedule.length; i++) {
        const elapsed = Date.now() - opts.startedAt;
        if (elapsed > opts.totalBudgetMs) {
            budgetExhausted = true;
            break;
        }
        const base = opts.schedule[i] ?? 0;
        const delay =
            base === 0
                ? 0
                : Math.max(0, base + (jitterMs > 0 ? (Math.random() * 2 - 1) * jitterMs : 0));
        if (delay > 0) await sleep(delay);

        attempts++;
        try {
            const value = await withTimeout(factory(), opts.perAttemptTimeoutMs);
            return { ok: true, value, attempts };
        } catch (err) {
            lastErr = err;
            if (!classify(err)) break;
        }
    }

    return { ok: false, error: lastErr, attempts, budgetExhausted };
}
