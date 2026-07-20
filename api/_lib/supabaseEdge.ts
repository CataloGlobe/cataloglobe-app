import {
    backoffWithJitter,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_TIMEOUT_MS,
    sleep,
    TimeoutError,
    withTimeout
} from "./retry.js";

/**
 * Wrapper server-side per chiamare la Supabase Edge Function
 * `resolve-public-catalog` via HTTP. Aggiunge:
 *   - retry/backoff/timeout (3 tentativi, 6s ciascuno, 0/1000/3000ms ± jitter)
 *   - classificazione errori:
 *     - `domain_error`: 4xx (eccetto 408/425/429) → no retry, propaga al client
 *     - `network_error`: 5xx, timeout, fetch fail → soggetti a retry
 *
 * NON usa il client `@supabase/supabase-js` per evitare di forzare SDK runtime
 * lato serverless. `fetch` nativo è sufficiente — edge function ha
 * `verify_jwt: false` quindi un semplice POST con apikey basta.
 */

export type PublicCatalogPayload = Record<string, unknown>;

export type EdgeSuccess = {
    kind: "success";
    payload: PublicCatalogPayload;
    status: number;
    attempts: number;
};

export type EdgeDomainError = {
    kind: "domain_error";
    status: number;
    body: unknown;
    attempts: number;
};

export type EdgeNetworkError = {
    kind: "network_error";
    cause: unknown;
    attempts: number;
};

export type EdgeResult = EdgeSuccess | EdgeDomainError | EdgeNetworkError;

type SupabaseEnv = { url: string; key: string };

function readSupabaseEnv(): SupabaseEnv {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key =
        process.env.SUPABASE_ANON_KEY ??
        process.env.VITE_SUPABASE_ANON_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            "Missing Supabase env vars: SUPABASE_URL / SUPABASE_ANON_KEY (o VITE_*, fallback SUPABASE_SERVICE_ROLE_KEY)"
        );
    }
    return { url: url.replace(/\/+$/, ""), key };
}

function isDomainStatus(status: number): boolean {
    // 408 (Timeout), 425 (Too Early), 429 (Rate Limit) sono 4xx retriabili
    if (status === 408 || status === 425 || status === 429) return false;
    return status >= 400 && status < 500;
}

/**
 * Errori "infrastrutturali" che il loop riconosce per fare retry.
 * Status numerico opzionale: utile a logging.
 */
class TransientEdgeError extends Error {
    status?: number;
    body?: unknown;
    constructor(message: string, status?: number, body?: unknown) {
        super(message);
        this.name = "TransientEdgeError";
        this.status = status;
        this.body = body;
    }
}

async function singleAttempt(args: { slug: string; lang?: string }): Promise<EdgeSuccess | EdgeDomainError> {
    const { url, key } = readSupabaseEnv();
    const body = JSON.stringify({
        slug: args.slug,
        ...(args.lang ? { lang: args.lang } : {})
    });

    const response = await fetch(`${url}/functions/v1/resolve-public-catalog`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            apikey: key
        },
        body
    });

    const status = response.status;
    let parsedBody: unknown = null;
    try {
        parsedBody = await response.json();
    } catch {
        // body non-JSON / vuoto
        parsedBody = null;
    }

    if (status >= 200 && status < 300) {
        return {
            kind: "success",
            payload: (parsedBody ?? {}) as PublicCatalogPayload,
            status,
            attempts: 0
        };
    }

    if (isDomainStatus(status)) {
        return { kind: "domain_error", status, body: parsedBody, attempts: 0 };
    }

    throw new TransientEdgeError(`Edge function returned status ${status}`, status, parsedBody);
}

/**
 * Override opzionali di retry/timeout. Default INVARIATI (3 tentativi, 6s) →
 * behavior-preserving per tutti i caller esistenti. Il pre-warm cron passa
 * `{maxAttempts:1, timeoutMs:3000}` per NON poter bruciare 18s (3×6s) su un
 * singolo slug lento e sforare il limite maxDuration Hobby.
 */
export type CallEdgeOptions = { maxAttempts?: number; timeoutMs?: number };

export async function callResolvePublicCatalog(
    args: {
        slug: string;
        lang?: string;
    },
    opts?: CallEdgeOptions
): Promise<EdgeResult> {
    const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const delay = backoffWithJitter(attempt);
        if (delay > 0) await sleep(delay);

        try {
            const result = await withTimeout(singleAttempt(args), timeoutMs);
            return { ...result, attempts: attempt + 1 };
        } catch (err) {
            lastError = err;
            // TimeoutError / TransientEdgeError / fetch failure → retry
            if (err instanceof TimeoutError || err instanceof TransientEdgeError || err instanceof Error) {
                continue;
            }
            // Errori inattesi (es. throw da readSupabaseEnv): non ritentare,
            // propaga come network_error con la causa intatta.
            break;
        }
    }

    return { kind: "network_error", cause: lastError, attempts: maxAttempts };
}

/**
 * Decide se un payload merita di essere snapshottato in Redis.
 *
 * "Healthy" = catalogo realmente consultabile dall'utente finale. Non
 * snapshot per:
 *   - presenza campo `error` (errori semantici incartati in 200)
 *   - `subscription_inactive === true`
 *   - `lang_unsupported === true` (frontend redirecta verso canonical, lo
 *     snapshot a quella combinazione slug+lang sarebbe muto)
 *   - `business.status !== "active"` (sede disattivata: anche se è un 200
 *     valido, l'eventuale riattivazione non invaliderebbe lo snapshot)
 *
 * Edge function `resolve-public-catalog` ritorna 200 con `business.status:
 * "inactive"` (vedi riga 361-373 dell'edge function) — caso esplicito da
 * non cachare.
 */
export function isHealthyPayload(payload: PublicCatalogPayload): boolean {
    if (!payload || typeof payload !== "object") return false;
    const obj = payload as Record<string, unknown>;
    if (obj.error) return false;
    if (obj.subscription_inactive === true) return false;
    if (obj.lang_unsupported === true) return false;
    const business = obj.business as { status?: string } | undefined;
    if (!business || business.status !== "active") return false;
    return true;
}
