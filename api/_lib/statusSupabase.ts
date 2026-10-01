/**
 * Service-role Supabase client per le rotte API serverless di status.
 *
 * Usato da:
 *   - api/cron/status-check.ts  → INSERT in status_checks + UPSERT in status_service_state
 *   - api/cron/status-prune.ts  → DELETE su status_checks scaduti
 *   - api/admin/status-incidents.ts → CRUD su status_incidents
 *
 * `service_role` bypassa RLS quindi è MAI esposto al browser. Vive solo
 * lato Vercel (env var `SUPABASE_SERVICE_ROLE_KEY`).
 *
 * Niente `@supabase/supabase-js`: chiamiamo direttamente la PostgREST API
 * via fetch — meno superficie, niente bundle SDK runtime, coerente con
 * `supabaseEdge.ts` (stesso file system api/_lib).
 */

type PgrestEnv = { url: string; serviceKey: string };

function readPgrestEnv(): PgrestEnv {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error(
            "Missing env vars: SUPABASE_URL (o VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY"
        );
    }
    return { url: url.replace(/\/+$/, ""), serviceKey };
}

type PgrestOptions = {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    /** Query string da accodare (senza '?' iniziale). */
    query?: string;
    /** Header Prefer (es. "return=representation"). */
    prefer?: string;
    /** Tetto della richiesta (AbortSignal.timeout). Assente = nessun tetto. */
    timeoutMs?: number;
};

export type PgrestSuccess<T> = { ok: true; status: number; data: T };
/** `status: 0` = nessuna risposta HTTP (timeout o errore di rete); `timedOut`
 *  distingue il primo caso. */
export type PgrestFailure = { ok: false; status: number; error: string; timedOut?: boolean };
export type PgrestResult<T> = PgrestSuccess<T> | PgrestFailure;

export async function pgrest<T = unknown>(
    table: string,
    opts: PgrestOptions = {}
): Promise<PgrestResult<T>> {
    const { url, serviceKey } = readPgrestEnv();
    const query = opts.query ? `?${opts.query}` : "";
    const endpoint = `${url}/rest/v1/${table}${query}`;
    const headers: Record<string, string> = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers["Prefer"] = opts.prefer;

    // Errori di trasporto (timeout, rete) restituiti come `ok: false`, mai
    // lanciati: il ciclo di status-check fa più chiamate in serie e un DB lento
    // non deve farlo saltare tutto (il 29/09 il probe è arrivato a 130 s).
    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: opts.method ?? "GET",
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {})
        });
    } catch (err) {
        const timedOut =
            err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
            ok: false,
            status: 0,
            error: timedOut
                ? `Timeout >${Math.round((opts.timeoutMs ?? 0) / 1000)}s`
                : err instanceof Error
                  ? err.message
                  : String(err),
            timedOut
        };
    }

    const status = response.status;
    if (status >= 200 && status < 300) {
        let data: unknown = null;
        const text = await response.text();
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        }
        return { ok: true, status, data: data as T };
    }

    let errorBody = "";
    try {
        errorBody = await response.text();
    } catch {
        errorBody = `<status ${status}>`;
    }
    return { ok: false, status, error: errorBody };
}

/**
 * Legge lo status dell'ULTIMA riga in `status_checks` per il servizio
 * dato. Usato dal cron `status-check` per implementare l'isteresi a 2
 * check consecutivi: questa funzione va chiamata PRIMA di `persistCheckRow`
 * così la riga corrente non si autorefenzia. Indice usato:
 * `status_checks_service_time_idx (service_key, checked_at DESC)`.
 *
 * Fail-open: in caso di errore PostgREST ritorna `null` (= "nessun
 * precedente"). Conseguenza: l'isteresi tratterà il check come bootstrap
 * e resterà silent. È preferibile alla failure rumorosa: meglio una
 * mail in meno per blip di rete che N mail spurie.
 */
export async function readPreviousObservation(
    serviceKey: string,
    timeoutMs?: number
): Promise<string | null> {
    const res = await pgrest<{ status: string }[]>("status_checks", {
        query:
            `select=status&service_key=eq.${encodeURIComponent(serviceKey)}` +
            `&order=checked_at.desc&limit=1`,
        timeoutMs
    });
    if (!res.ok) return null;
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows[0]?.status ?? null;
}

/**
 * Probe banale del database via PostgREST.
 *
 * Tetto di 10 s (DATABASE_PROBE_TIMEOUT_MS): oltre, `ok: false` con
 * «Timeout >10s» → il servizio vale `down`.
 *
 * Bersaglio: `tenants` con `select=id&limit=1`. Riprova:
 *   - misura latenza rete + tempo di Postgres per servire una SELECT triviale
 *   - non dipende dalle tabelle nuove di status (resta verde anche durante
 *     prime release pre-migration, evita falsi positivi al bootstrap)
 *   - tabella sicuramente esistente in tutti gli env (è la radice del dominio)
 */
export const DATABASE_PROBE_TIMEOUT_MS = 10_000;

export async function probeDatabase(): Promise<{ ok: boolean; ms: number; error?: string }> {
    const start = Date.now();
    try {
        const res = await pgrest<unknown[]>("tenants", {
            query: "select=id&limit=1",
            timeoutMs: DATABASE_PROBE_TIMEOUT_MS
        });
        const ms = Date.now() - start;
        if (res.ok) return { ok: true, ms };
        if (res.status === 0) return { ok: false, ms, error: res.error };
        return { ok: false, ms, error: `HTTP ${res.status}: ${res.error.slice(0, 200)}` };
    } catch (err) {
        const ms = Date.now() - start;
        return { ok: false, ms, error: err instanceof Error ? err.message : String(err) };
    }
}
