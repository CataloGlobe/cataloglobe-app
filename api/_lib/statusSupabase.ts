/**
 * Service-role Supabase client per le rotte API serverless di status.
 *
 * Usato da:
 *   - api/_cron/status-check.ts  → INSERT in status_checks + UPSERT in status_service_state
 *   - api/_cron/status-prune.ts  → DELETE su status_checks scaduti
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
};

export type PgrestSuccess<T> = { ok: true; status: number; data: T };
export type PgrestFailure = { ok: false; status: number; error: string };
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

    const response = await fetch(endpoint, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });

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
 * Probe banale del database via PostgREST.
 *
 * Bersaglio: `tenants` con `select=id&limit=1`. Riprova:
 *   - misura latenza rete + tempo di Postgres per servire una SELECT triviale
 *   - non dipende dalle tabelle nuove di status (resta verde anche durante
 *     prime release pre-migration, evita falsi positivi al bootstrap)
 *   - tabella sicuramente esistente in tutti gli env (è la radice del dominio)
 */
export async function probeDatabase(): Promise<{ ok: boolean; ms: number; error?: string }> {
    const start = Date.now();
    try {
        const res = await pgrest<unknown[]>("tenants", {
            query: "select=id&limit=1"
        });
        const ms = Date.now() - start;
        if (res.ok) return { ok: true, ms };
        return { ok: false, ms, error: `HTTP ${res.status}: ${res.error.slice(0, 200)}` };
    } catch (err) {
        const ms = Date.now() - start;
        return { ok: false, ms, error: err instanceof Error ? err.message : String(err) };
    }
}
