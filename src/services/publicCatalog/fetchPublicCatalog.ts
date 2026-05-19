import { supabase } from "@/services/supabase/client";

/**
 * Wrapper resiliente per il caricamento del payload del menu pubblico.
 *
 * Due path possibili:
 *   1. Path pubblico (utente anonimo, no simulate): chiama l'endpoint Vercel
 *      `/api/public-catalog`, che a sua volta fa da proxy verso la Supabase
 *      Edge Function `resolve-public-catalog` con cache Upstash Redis.
 *      Retry browser ridotto (2 tentativi, 3s timeout): la maggior parte
 *      della resilienza è ora server-side. Retry qui serve SOLO per problemi
 *      di rete locale device↔Vercel (es. WiFi ballerino al tavolo del
 *      ristorante).
 *
 *   2. Path simulate (dashboard preview, utente autenticato): chiama
 *      direttamente `supabase.functions.invoke("resolve-public-catalog")`
 *      con `simulate`. NON passa dal proxy Vercel perché:
 *        - i payload simulate sono time-shifted, non vanno cachati;
 *        - è dashboard interna, latenza accettabile;
 *        - tiene la dipendenza da Upstash fuori dal flusso preview.
 *      Retry più generoso (3 tentativi, 6s timeout).
 *
 * Classificazione errori:
 *   - "domain" → errore semanticamente definitivo (not_found, invalid_link).
 *     Nessun retry. Frontend mostra UI dedicata (NotFound).
 *   - "network" → fallimento di trasporto (fetch fail, timeout, 5xx).
 *     Path pubblico: retry SOLO su fetch fail / timeout; 5xx NON è ritentato
 *     perché significa che il server ha già esaurito i suoi retry.
 *     Path simulate: retry su qualunque errore non-domain.
 */

export type FetchPublicCatalogArgs = {
    slug: string;
    lang?: string;
    simulate?: string;
};

export type PublicCatalogPayload = Record<string, unknown>;

/** Origine del payload come segnalata dall'header `x-cataloglobe-source`. */
export type CatalogSource = "live" | "stale" | "unknown";

export type FetchSuccess = {
    kind: "success";
    payload: PublicCatalogPayload;
    attempts: number;
    source: CatalogSource;
    staleSince?: string;
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

const PUBLIC_MAX_ATTEMPTS = 2;
const PUBLIC_TIMEOUT_MS = 3_000;
const PUBLIC_BACKOFF_SCHEDULE_MS = [0, 1_000];

const SIMULATE_MAX_ATTEMPTS = 3;
const SIMULATE_TIMEOUT_MS = 6_000;
const SIMULATE_BACKOFF_SCHEDULE_MS = [0, 1_000, 3_000];

const JITTER_MS = 200;

/**
 * Codici "definitivi" che l'endpoint Vercel (o il fallback simulate path)
 * può emettere. Mantengono retro-compatibilità con i codici già usati nella
 * legacy `classifyError`.
 */
const DOMAIN_ERROR_CODES = new Set([
    "not_found",
    "invalid_link",
    "invalid_slug",
    "invalid_lang",
    "missing_slug",
    "tenant_not_found",
    "domain_error"
]);

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffWithJitter(attemptIndex: number, schedule: number[]): number {
    const base = schedule[attemptIndex] ?? schedule[schedule.length - 1] ?? 0;
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

/**
 * Errore "soft" per response 5xx dal proxy Vercel. Inteso a NON triggerare
 * retry browser-side (il server ha già esaurito i suoi retry).
 */
class ServerErrorResponse extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
        super(`Proxy returned ${status}`);
        this.name = "ServerErrorResponse";
        this.status = status;
        this.body = body;
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

/* =========================================================================
 * PATH PUBBLICO — chiama /api/public-catalog
 * ========================================================================= */

type NormalizedErrorBody = {
    error?: {
        code?: string;
        messageKey?: string;
        message?: string;
    };
};

function parseNormalizedError(body: unknown): { code: string; message: string } {
    const b = body as NormalizedErrorBody | null;
    const code = b?.error?.code ?? "domain_error";
    const message = b?.error?.messageKey ?? b?.error?.message ?? "Domain error";
    return { code, message };
}

function normalizeSource(raw: string | null): CatalogSource {
    if (raw === "live" || raw === "stale") return raw;
    return "unknown";
}

async function singleAttemptPublic(args: FetchPublicCatalogArgs): Promise<FetchSuccess | FetchDomainError> {
    const params = new URLSearchParams({ slug: args.slug });
    if (args.lang) params.set("lang", args.lang);

    const response = await fetch(`/api/public-catalog?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (response.status >= 200 && response.status < 300) {
        const payload = (await response.json()) as PublicCatalogPayload;
        const source = normalizeSource(response.headers.get("x-cataloglobe-source"));
        const staleSince = response.headers.get("x-cataloglobe-stale-since") ?? undefined;
        return {
            kind: "success",
            payload,
            attempts: 0, // riempito dal loop
            source,
            ...(staleSince ? { staleSince } : {})
        };
    }

    if (response.status >= 400 && response.status < 500) {
        let body: unknown = null;
        try { body = await response.json(); } catch { /* body non JSON */ }
        const { code, message } = parseNormalizedError(body);
        return { kind: "domain_error", code, message };
    }

    // 5xx (inclusi 503 di cache miss + supabase down): leggi body diagnostico
    // ma NON ritentare — server già esaurì retry.
    let body: unknown = null;
    try { body = await response.json(); } catch { /* body non JSON */ }
    throw new ServerErrorResponse(response.status, body);
}

async function fetchPublicCatalogPublic(args: FetchPublicCatalogArgs): Promise<FetchResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt < PUBLIC_MAX_ATTEMPTS; attempt++) {
        const delay = backoffWithJitter(attempt, PUBLIC_BACKOFF_SCHEDULE_MS);
        if (delay > 0) {
            console.debug(`[fetchPublicCatalog] public retry ${attempt + 1}/${PUBLIC_MAX_ATTEMPTS} after ${Math.round(delay)}ms`);
            await sleep(delay);
        }

        try {
            const result = await withTimeout(singleAttemptPublic(args), PUBLIC_TIMEOUT_MS);
            if (result.kind === "success") {
                return { ...result, attempts: attempt + 1 };
            }
            return result; // domain_error: short-circuit
        } catch (err) {
            lastError = err;

            if (err instanceof ServerErrorResponse) {
                // 5xx dal proxy → niente retry browser, propaga come network_error.
                console.debug(`[fetchPublicCatalog] proxy returned ${err.status} — not retrying browser-side`);
                return { kind: "network_error", attempts: attempt + 1, cause: err };
            }

            // TimeoutError o fetch fail → retry se attempt rimanenti
            console.debug(`[fetchPublicCatalog] transport error on attempt ${attempt + 1}:`, err);
        }
    }

    return { kind: "network_error", attempts: PUBLIC_MAX_ATTEMPTS, cause: lastError };
}

/* =========================================================================
 * PATH SIMULATE — chiama Supabase Edge Function direttamente
 * ========================================================================= */

function classifySimulateError(err: unknown): "domain" | "network" {
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

function extractSimulateDomainError(err: unknown): { code: string; message: string } {
    const e = err as { code?: string; message?: string };
    const code = (e?.code ?? "domain_error").toString();
    const message = (e?.message ?? "Domain error from resolve-public-catalog").toString();
    return { code, message };
}

async function fetchPublicCatalogSimulate(args: FetchPublicCatalogArgs): Promise<FetchResult> {
    const body = {
        slug: args.slug,
        ...(args.lang ? { lang: args.lang } : {}),
        ...(args.simulate ? { simulate: args.simulate } : {})
    };

    let lastError: unknown;

    for (let attempt = 0; attempt < SIMULATE_MAX_ATTEMPTS; attempt++) {
        const delay = backoffWithJitter(attempt, SIMULATE_BACKOFF_SCHEDULE_MS);
        if (delay > 0) {
            console.debug(`[fetchPublicCatalog] simulate retry ${attempt + 1}/${SIMULATE_MAX_ATTEMPTS} after ${Math.round(delay)}ms`);
            await sleep(delay);
        }

        try {
            const { data, error } = await withTimeout(
                supabase.functions.invoke("resolve-public-catalog", { body }),
                SIMULATE_TIMEOUT_MS
            );

            if (error) throw error;
            if (!data) throw new Error("resolve-public-catalog returned empty payload");

            return {
                kind: "success",
                payload: data as PublicCatalogPayload,
                attempts: attempt + 1,
                source: "unknown" // simulate path non passa dal proxy → no header
            };
        } catch (err) {
            lastError = err;
            const kind = classifySimulateError(err);

            if (kind === "domain") {
                const { code, message } = extractSimulateDomainError(err);
                console.debug(`[fetchPublicCatalog] simulate domain error (no retry): ${code}`);
                return { kind: "domain_error", code, message };
            }

            console.debug(`[fetchPublicCatalog] simulate network error on attempt ${attempt + 1}:`, err);
        }
    }

    return { kind: "network_error", attempts: SIMULATE_MAX_ATTEMPTS, cause: lastError };
}

/* =========================================================================
 * ENTRY POINT
 * ========================================================================= */

export async function fetchPublicCatalog(args: FetchPublicCatalogArgs): Promise<FetchResult> {
    if (args.simulate) {
        return fetchPublicCatalogSimulate(args);
    }
    return fetchPublicCatalogPublic(args);
}
