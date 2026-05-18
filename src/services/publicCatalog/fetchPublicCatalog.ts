import { supabase } from "@/services/supabase/client";

/**
 * Wrapper resiliente intorno all'edge function `resolve-public-catalog`.
 *
 * Aggiunge retry con exponential backoff, timeout per tentativo, e
 * normalizzazione degli errori in due categorie:
 *   - "domain" → errore semanticamente definitivo dall'edge function (es.
 *     `not_found`, `invalid_link`, `subscription_inactive`). Non si fa retry.
 *   - "network" → fallimento di trasporto/timeout/5xx. Soggetto a retry.
 *
 * Il payload "domain inactive" (es. `subscription_inactive: true` o
 * `business.status !== "active"`) viene comunque restituito come `success`:
 * è una risposta valida dell'edge function, non un errore. La distinzione
 * tra "domain inactive" e "domain error" la fa il chiamante leggendo il
 * payload normalizzato.
 */

export type FetchPublicCatalogArgs = {
    slug: string;
    lang?: string;
    simulate?: string;
};

export type PublicCatalogPayload = Record<string, unknown>;

export type FetchSuccess = {
    kind: "success";
    payload: PublicCatalogPayload;
    attempts: number;
};

export type FetchDomainError = {
    kind: "domain_error";
    code: string;
    message: string;
};

export type FetchNetworkError = {
    kind: "network_error";
    attempts: number;
    cause: unknown;
};

export type FetchResult = FetchSuccess | FetchDomainError | FetchNetworkError;

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 6_000;
const BACKOFF_SCHEDULE_MS = [0, 1_000, 3_000];
const JITTER_MS = 200;

/**
 * Edge-function-level error codes that are "definitive": no point retrying
 * because the answer won't change without a code/data fix upstream.
 */
const DOMAIN_ERROR_CODES = new Set([
    "not_found",
    "invalid_link",
    "invalid_slug",
    "invalid_lang",
    "tenant_not_found"
]);

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffWithJitter(attemptIndex: number): number {
    const base = BACKOFF_SCHEDULE_MS[attemptIndex] ?? BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1];
    if (base === 0) return 0;
    const jitter = (Math.random() * 2 - 1) * JITTER_MS;
    return Math.max(0, base + jitter);
}

class TimeoutError extends Error {
    constructor() {
        super("fetchPublicCatalog: attempt timeout");
        this.name = "TimeoutError";
    }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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

/**
 * Tenta di estrarre un codice di errore "di dominio" da uno scarto edge
 * function. La functions.invoke restituisce errore con shape variabile a
 * seconda della causa (FunctionsHttpError vs FunctionsFetchError vs raw).
 * Si controlla:
 *   - oggetto JSON nel body con campo `code`
 *   - status HTTP semantico (404, 410, 422 trattati come dominio)
 */
function classifyError(err: unknown): "domain" | "network" {
    if (err instanceof TimeoutError) return "network";

    const e = err as { context?: { status?: number; body?: unknown }; status?: number; code?: string };
    const status = e?.context?.status ?? e?.status;

    if (typeof status === "number") {
        if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
            return "domain";
        }
    }

    const code = (e?.code ?? "").toString();
    if (DOMAIN_ERROR_CODES.has(code)) return "domain";

    return "network";
}

function extractDomainError(err: unknown): { code: string; message: string } {
    const e = err as { code?: string; message?: string; context?: { status?: number } };
    const code = (e?.code ?? "domain_error").toString();
    const message = (e?.message ?? "Domain error from resolve-public-catalog").toString();
    return { code, message };
}

export async function fetchPublicCatalog(args: FetchPublicCatalogArgs): Promise<FetchResult> {
    const body = {
        slug: args.slug,
        ...(args.lang ? { lang: args.lang } : {}),
        ...(args.simulate ? { simulate: args.simulate } : {})
    };

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const delay = backoffWithJitter(attempt);
        if (delay > 0) {
            console.debug(`[fetchPublicCatalog] retry attempt ${attempt + 1}/${MAX_ATTEMPTS} after ${Math.round(delay)}ms`);
            await sleep(delay);
        }

        try {
            const { data, error } = await withTimeout(
                supabase.functions.invoke("resolve-public-catalog", { body }),
                TIMEOUT_MS
            );

            if (error) throw error;
            if (!data) throw new Error("resolve-public-catalog returned empty payload");

            return {
                kind: "success",
                payload: data as PublicCatalogPayload,
                attempts: attempt + 1
            };
        } catch (err) {
            lastError = err;
            const kind = classifyError(err);

            if (kind === "domain") {
                const { code, message } = extractDomainError(err);
                console.debug(`[fetchPublicCatalog] domain error (no retry): ${code}`);
                return { kind: "domain_error", code, message };
            }

            console.debug(`[fetchPublicCatalog] network error on attempt ${attempt + 1}:`, err);
        }
    }

    return {
        kind: "network_error",
        attempts: MAX_ATTEMPTS,
        cause: lastError
    };
}
