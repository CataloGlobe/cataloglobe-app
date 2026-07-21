import type { VercelRequest, VercelResponse } from "@vercel/node";

import { getEnvNamespace, getRedis } from "../_lib/redis.js";
import { snapshotPublicCatalog } from "../_lib/snapshotPublicCatalog.js";

/**
 * POST /api/public-catalog/revalidate
 *
 * Invalida la cache Redis di TUTTE le sedi (slug) di un tenant e ripopola
 * subito lo snapshot "base" (senza lang) chiamando `resolve-public-catalog`.
 * In questo modo il primo utente che arriva dopo non paga il roundtrip Supabase.
 *
 * Body:
 *   { "tenantId": "<uuid>" }   // obbligatorio
 *
 * Auth (JWT utente — NO secret condiviso):
 *   - Header `Authorization: Bearer <supabase_access_token>` obbligatorio.
 *   - Si valida il JWT + lo scope chiamando la RPC `get_my_permissions(tenantId)`
 *     con il token dell'utente (gira come l'utente, non service_role).
 *   - Serve il permesso `catalogs.write` sul tenant. Un viewer NON può purgare.
 *   - Membership e permesso derivati lato DB (la RPC copre anche l'owner, che
 *     non ha righe in `tenant_memberships`).
 *
 * Il vecchio `REVALIDATE_SECRET` (secret condiviso finito nel bundle browser
 * via `VITE_REVALIDATE_SECRET`) è stato RIMOSSO: chiunque poteva forzare purge
 * arbitrari (DoS-adjacent sulla cache di resilienza). Nessun consumatore
 * server↔server usava il secret (i cron chiamano `snapshotPublicCatalog`
 * diretto), quindi il cutover è netto: solo JWT utente.
 *
 * Granularità: per ogni slug cancella TUTTE le lingue (pattern
 * `cataloglobe:{env}:public-catalog:v1:<slug>:*`) — le traduzioni potrebbero
 * essere cambiate, evita mismatch tra lingue.
 *
 * Rate limit: leggero, per-tenant (Redis INCR + EXPIRE), fail-open. Il client
 * è fire-and-forget: un 429 lascia solo la cache stale fino al prossimo giro/TTL.
 */

type NormalizedErrorBody = {
    error: {
        code: string;
        message?: string;
    };
};

function err(code: string, message?: string): NormalizedErrorBody {
    return { error: { code, ...(message ? { message } : {}) } };
}

type RevalidateOutcome = {
    slug: string;
    keysDeleted: number;
    freshSnapshotSaved: boolean;
};

type LogRecord = {
    event: "public_catalog_revalidate";
    tenantId?: string;
    slugs: string[];
    outcomes: RevalidateOutcome[];
    durationMs: number;
    status: number;
    env: string;
};

function log(rec: LogRecord): void {
    console.log(JSON.stringify(rec));
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limit per-tenant: max RL_MAX richieste per finestra RL_WINDOW_SECONDS.
// Generoso di proposito — revalidate è idempotente e tenant-wide, quindi
// scartare i duplicati di un burst di salvataggi è innocuo (l'ultimo vince).
const RL_MAX = 30;
const RL_WINDOW_SECONDS = 60;

function parseTenantId(body: unknown): { tenantId: string } | { error: NormalizedErrorBody } {
    if (!body || typeof body !== "object") {
        return { error: err("invalid_body", "Body must be a JSON object") };
    }
    const raw = (body as Record<string, unknown>).tenantId;
    if (typeof raw !== "string") {
        return { error: err("missing_tenant_id", "Provide `tenantId` (string)") };
    }
    const trimmed = raw.trim();
    if (!UUID_REGEX.test(trimmed)) {
        return { error: err("invalid_tenant_id", `Invalid tenantId: ${raw}`) };
    }
    return { tenantId: trimmed };
}

function extractBearer(req: VercelRequest): string | null {
    const raw = req.headers["authorization"] ?? req.headers["Authorization"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || typeof header !== "string") return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

function readSupabaseEnv(): { url: string; anonKey: string } | null {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    return { url: url.replace(/\/+$/, ""), anonKey };
}

type AuthResult = { ok: true } | { ok: false; status: number; code: string };

/**
 * Valida il JWT utente e verifica `catalogs.write` sul tenant chiamando
 * `get_my_permissions(tenantId)` come l'utente (il token nel Bearer di PostgREST
 * imposta `auth.uid()`, la RPC deriva ruolo + permessi lato DB).
 *
 * Mapping stati PostgREST:
 *   - 401  → JWT assente/scaduto/firma invalida  → 401
 *   - 403  → RAISE 42501 (non membro del tenant) → 403
 *   - 200  → parse permessi; niente `catalogs.write` → 403
 */
async function authorizeTenantWrite(token: string, tenantId: string): Promise<AuthResult> {
    const cfg = readSupabaseEnv();
    if (!cfg) {
        return { ok: false, status: 500, code: "server_misconfigured" };
    }
    let res: Response;
    try {
        res = await fetch(`${cfg.url}/rest/v1/rpc/get_my_permissions`, {
            method: "POST",
            headers: {
                apikey: cfg.anonKey,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ p_tenant_id: tenantId })
        });
    } catch {
        return { ok: false, status: 502, code: "auth_upstream_unreachable" };
    }
    if (res.status === 401) {
        return { ok: false, status: 401, code: "unauthorized" };
    }
    if (res.status === 403) {
        // 42501: caller non appartiene al tenant.
        return { ok: false, status: 403, code: "forbidden" };
    }
    if (!res.ok) {
        return { ok: false, status: 502, code: "auth_upstream_error" };
    }
    let rows: Array<{ permissions?: string[] | null }>;
    try {
        rows = (await res.json()) as Array<{ permissions?: string[] | null }>;
    } catch {
        return { ok: false, status: 502, code: "auth_upstream_invalid_json" };
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
        return { ok: false, status: 403, code: "forbidden" };
    }
    const perms = Array.isArray(row.permissions) ? row.permissions : [];
    if (!perms.includes("catalogs.write")) {
        return { ok: false, status: 403, code: "forbidden_missing_permission" };
    }
    return { ok: true };
}

/**
 * Risolve gli slug delle sedi del tenant leggendo `activities` come l'utente.
 * RLS applica comunque lo scope tenant (`get_my_tenant_ids()`); l'`eq` esplicito
 * è difesa in profondità. Ritorna null su errore infrastrutturale.
 */
async function resolveTenantSlugs(token: string, tenantId: string): Promise<string[] | null> {
    const cfg = readSupabaseEnv();
    if (!cfg) return null;
    const url = `${cfg.url}/rest/v1/activities?tenant_id=eq.${encodeURIComponent(tenantId)}&select=slug`;
    let res: Response;
    try {
        res = await fetch(url, {
            headers: {
                apikey: cfg.anonKey,
                Authorization: `Bearer ${token}`
            }
        });
    } catch {
        return null;
    }
    if (!res.ok) return null;
    let rows: Array<{ slug?: unknown }>;
    try {
        rows = (await res.json()) as Array<{ slug?: unknown }>;
    } catch {
        return null;
    }
    if (!Array.isArray(rows)) return null;
    return rows
        .map(r => r?.slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0 && SLUG_REGEX.test(s));
}

/**
 * Rate limit per-tenant via Redis INCR + EXPIRE. Ritorna `true` se consentito.
 * Fail-open: se Redis è degradato NON blocca il revalidate (non-critico).
 */
async function isWithinRateLimit(tenantId: string, env: string): Promise<boolean> {
    try {
        const redis = getRedis();
        const key = `cataloglobe:${env}:revalidate-rl:${tenantId}`;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, RL_WINDOW_SECONDS);
        }
        return count <= RL_MAX;
    } catch {
        return true;
    }
}

/**
 * Scansiona Redis per le chiavi che matchano il pattern e le cancella in batch.
 * Usa SCAN iterativo (cursor-based) per evitare KEYS bloccante.
 */
async function deleteKeysByPattern(pattern: string): Promise<number> {
    const redis = getRedis();
    let cursor: string | number = "0";
    const toDelete: string[] = [];

    do {
        // Upstash SDK: scan(cursor, { match, count })
        const [nextCursor, keys] = (await redis.scan(cursor, { match: pattern, count: 100 })) as [
            string | number,
            string[]
        ];
        if (Array.isArray(keys) && keys.length > 0) {
            toDelete.push(...keys);
        }
        cursor = nextCursor;
    } while (String(cursor) !== "0");

    if (toDelete.length === 0) return 0;
    // del() accetta varargs di chiavi
    await redis.del(...toDelete);
    return toDelete.length;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const startedAt = Date.now();
    const env = getEnvNamespace();

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 405,
            env
        });
        res.status(405).json(err("method_not_allowed"));
        return;
    }

    const token = extractBearer(req);
    if (!token) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 401,
            env
        });
        res.status(401).json(err("unauthorized", "Missing Bearer access token"));
        return;
    }

    const parsed = parseTenantId(req.body);
    if ("error" in parsed) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 400,
            env
        });
        res.status(400).json(parsed.error);
        return;
    }
    const { tenantId } = parsed;

    const auth = await authorizeTenantWrite(token, tenantId);
    if (!auth.ok) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            tenantId,
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: auth.status,
            env
        });
        res.status(auth.status).json(err(auth.code));
        return;
    }

    if (!(await isWithinRateLimit(tenantId, env))) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Retry-After", String(RL_WINDOW_SECONDS));
        log({
            event: "public_catalog_revalidate",
            tenantId,
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 429,
            env
        });
        res.status(429).json(err("rate_limited"));
        return;
    }

    const slugs = await resolveTenantSlugs(token, tenantId);
    if (slugs === null) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            tenantId,
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 502,
            env
        });
        res.status(502).json(err("slug_resolution_failed"));
        return;
    }

    const outcomes: RevalidateOutcome[] = [];

    // Processa in parallelo gli slug; ognuno è indipendente.
    await Promise.all(
        slugs.map(async slug => {
            let keysDeleted = 0;
            let freshSnapshotSaved = false;
            try {
                const pattern = `cataloglobe:${env}:public-catalog:v1:${slug}:*`;
                keysDeleted = await deleteKeysByPattern(pattern);
            } catch (e) {
                console.error(JSON.stringify({
                    event: "public_catalog_revalidate_scan_failed",
                    slug,
                    env,
                    error: e instanceof Error ? e.message : String(e)
                }));
            }
            try {
                // Ripopolo base-lang (post-purge). Helper condiviso, fail-soft:
                // "written" solo se payload healthy + write Redis ok — identico
                // al vecchio warmBaseSnapshot (boolean preservato).
                freshSnapshotSaved = (await snapshotPublicCatalog({ slug })) === "written";
            } catch (e) {
                console.error(JSON.stringify({
                    event: "public_catalog_revalidate_warm_unexpected",
                    slug,
                    env,
                    error: e instanceof Error ? e.message : String(e)
                }));
            }
            outcomes.push({ slug, keysDeleted, freshSnapshotSaved });
        })
    );

    res.setHeader("Cache-Control", "no-store");
    log({
        event: "public_catalog_revalidate",
        tenantId,
        slugs,
        outcomes,
        durationMs: Date.now() - startedAt,
        status: 200,
        env
    });

    res.status(200).json({ revalidated: outcomes });
}
