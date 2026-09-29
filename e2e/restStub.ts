import type { Page, Route } from "@playwright/test";

/**
 * La macchina degli stub REST degli e2e (estratta da `menuStub.ts`, lotto
 * `ds-5-programmazione` P0). Ogni pagina ci mette i suoi dati; qui ci sono le
 * regole comuni:
 *
 * - le letture delle tabelle elencate rispondono dai dati finti, filtrate come
 *   farebbe PostgREST sui parametri che le pagine usano (`matches`);
 * - le scritture non partono mai. POST, PATCH e DELETE su qualunque tabella, le
 *   RPC che non leggono e le edge function sono intercettate: chi prova un gesto
 *   registra una risposta con `onWrite` («tabella.METODO», «rpc.nome», «fn.nome»)
 *   e controlla corpo e filtri (test di cablaggio). Un gesto senza risposta
 *   registrata riceve 500, come un server rotto;
 * - le RPC di lettura (`get_`, `is_`, `has_`, `can_`) passano al server vero,
 *   salvo quelle che la pagina dichiara in `rpc`.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

/** Il sottoinsieme dei filtri PostgREST che le pagine stubbate usano. */
export function matches(row: Row, params: URLSearchParams): boolean {
    for (const [key, raw] of params) {
        if (["select", "order", "limit", "offset", "or", "and"].includes(key) || key.includes(".")) continue;
        const dot = raw.indexOf(".");
        const op = raw.slice(0, dot);
        const value = raw.slice(dot + 1);
        const field = row[key];
        const text = field === null || field === undefined ? null : String(field);
        if (op === "eq" && text !== value) return false;
        if (op === "neq" && text === value) return false;
        if (op === "is" && !(value === "null" ? text === null : text === value)) return false;
        if (op === "in" && !value.replace(/[()"]/g, "").split(",").includes(text ?? "")) return false;
    }
    return true;
}

export type WriteCall = { key: string; params: URLSearchParams; body: unknown };

/** Risposta d'errore di una scrittura: un gestore la ritorna per simulare il server che rifiuta. */
export class StubError {
    constructor(
        readonly status: number,
        readonly json: unknown = { code: "E2E", message: "rifiutata dall'e2e" }
    ) {}
}
export type WriteHandler = (call: WriteCall) => unknown;

export type RestStub = {
    /** Ogni scrittura intercettata, in ordine («tabella.METODO», filtri, corpo). */
    writes: WriteCall[];
    /** Registra la risposta finta di una scrittura (test di cablaggio). */
    onWrite: (key: string, handler: WriteHandler) => void;
    /**
     * Toglie un permesso dalla risposta vera di `get_my_permissions`. Risolve
     * `revoked` alla prima risposta riscritta: prima di allora le azioni sono
     * nascoste comunque (permessi in caricamento), e un «non c'è» passerebbe
     * senza aver provato niente.
     */
    revoke: (permission: string) => Promise<void>;
    revoked: Promise<void>;
};

export type RestStubOptions = {
    tables: Tables;
    /** Arricchisce le righe lette (embedding PostgREST che `matches` non fa). */
    enrich?: (table: string, rows: Row[], params: URLSearchParams) => Row[];
    /** RPC di lettura servite dallo stub invece che dal server vero. */
    rpc?: Record<string, (body: unknown) => unknown>;
};

export async function stubRest(page: Page, options: RestStubOptions): Promise<RestStub> {
    const { tables, enrich, rpc = {} } = options;
    const handlers = new Map<string, WriteHandler>();
    let markRevoked: () => void = () => {};
    const revoked = new Promise<void>(resolve => {
        markRevoked = resolve;
    });
    const stub: RestStub = {
        writes: [],
        onWrite: (key, handler) => handlers.set(key, handler),
        revoked,
        revoke: async permission => {
            await page.route(/\/rest\/v1\/rpc\/get_my_permissions/, async route => {
                try {
                    const response = await route.fetch();
                    const rows = (await response.json()) as Array<{ permissions: string[] | null }>;
                    for (const row of rows) row.permissions = (row.permissions ?? []).filter(p => p !== permission);
                    await route.fulfill({ response, json: rows });
                    markRevoked();
                } catch {
                    // Pagina chiusa a metà richiesta (fine del test): niente da riscrivere.
                }
            });
        }
    };

    async function intercept(route: Route, key: string) {
        const request = route.request();
        const params = new URL(request.url()).searchParams;
        const body = request.postData() ? (request.postDataJSON() as unknown) : null;
        const call = { key, params, body };
        stub.writes.push(call);
        const handler = handlers.get(key);
        if (!handler) {
            return route.fulfill({ status: 500, json: { code: "E2E", message: `${key} non prevista dall'e2e` } });
        }
        const json = handler(call);
        if (json instanceof StubError) return route.fulfill({ status: json.status, json: json.json });
        if (json === undefined || json === null) return route.fulfill({ status: 204, body: "" });
        await route.fulfill({ status: request.method() === "POST" ? 201 : 200, json });
    }

    // Registrata per prima: Playwright prova le rotte dall'ultima, quindi
    // questa è la rete sotto tutte le altre. Ogni scrittura su una tabella
    // qualunque (traduzioni, code di lavoro…) passa di qui.
    await page.route("**/rest/v1/**", route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const table = path.split("/rest/v1/")[1] ?? "";
        if (table.startsWith("rpc/")) {
            const fn = table.slice(4);
            return /^(get|is|has|can)_/.test(fn) ? route.fallback() : intercept(route, `rpc.${fn}`);
        }
        if (request.method() === "GET" || request.method() === "HEAD") return route.fallback();
        return intercept(route, `${table}.${request.method()}`);
    });

    for (const table of Object.keys(tables)) {
        await page.route(new RegExp(`/rest/v1/${table}(\\?|$)`), async route => {
            const request = route.request();
            const method = request.method();
            if (method !== "GET" && method !== "HEAD") return intercept(route, `${table}.${method}`);
            const params = new URL(request.url()).searchParams;
            let rows = tables[table].filter(row => matches(row, params));
            if (enrich) rows = enrich(table, rows, params);
            // I conteggi (`count: "exact"`, anche `head: true`) leggono il totale da qui.
            const headers = { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : `*/0` };
            if (method === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
            const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
            if (!wantsObject) return route.fulfill({ json: rows, headers });
            if (rows.length !== 1) {
                return route.fulfill({
                    status: 406,
                    json: { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }
                });
            }
            return route.fulfill({ json: rows[0] });
        });
    }

    for (const [fn, serve] of Object.entries(rpc)) {
        await page.route(new RegExp(`/rest/v1/rpc/${fn}(\\?|$)`), route => {
            const request = route.request();
            const body = request.postData() ? (request.postDataJSON() as unknown) : null;
            return route.fulfill({ json: serve(body) });
        });
    }

    await page.route(/\/functions\/v1\//, route => intercept(route, `fn.${new URL(route.request().url()).pathname.split("/").pop()}`));

    return stub;
}
