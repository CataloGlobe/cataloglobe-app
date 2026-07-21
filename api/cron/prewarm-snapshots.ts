import type { VercelRequest, VercelResponse } from "@vercel/node";

import { snapshotPublicCatalog } from "../_lib/snapshotPublicCatalog.js";
import { timingSafeCompare } from "../_lib/timingSafeCompare.js";
import {
    BASE_LANG_PART,
    getRedis,
    parseSnapshotKey,
    snapshotKeyMatchPattern
} from "../_lib/redis.js";

/**
 * Cron: pre-warming degli snapshot Redis (base-lang) degli slug attivi (Gap #1).
 *
 * Scopo: rendere la resilienza INCONDIZIONATA. Il fallback Redis (usato quando
 * Supabase è down) copre solo gli slug "caldi"; un locale attivo senza traffico
 * recente, o con snapshot scaduto, durante un outage mostrerebbe pagina rotta.
 * Questo giro giornaliero riscrive lo snapshot base di OGNI slug attivo.
 *
 * DISTINTO dal warmup di latenza (api/cron/warmup-public-catalog.ts): quello
 * scalda la lambda (cold start, ping ?warmup=1 che NON tocca Redis/Postgres);
 * questo scalda gli snapshot DATI (resolve edge + write Redis). Non unificare.
 *
 * Flusso:
 *   1. RPC list_active_public_slugs() (service_role) → elenco slug attivi.
 *   2. Per ogni slug: snapshotPublicCatalog({slug}) — base-lang, REPOPULATE-ONLY
 *      (nessun purge, a differenza di revalidate).
 * Concorrenza limitata (5) + resolve senza retry con timeout corto (3s): un
 * singolo slug lento non deve sforare il limite maxDuration Hobby (~10s).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (server-only), pattern identico a
 * warmup-public-catalog.ts / status-check.ts.
 *
 * Chunking-ready: query opzionali `?offset` e `?limit` per paginare a più
 * invocazioni quando N crescerà. Default: tutti gli slug in un giro.
 *
 * Trigger: cron-job.org (giornaliero). vercel.json non ha `crons`.
 */

const CONCURRENCY = 5;
// Resolve senza retry (1 tentativo) e timeout corto: cap ~3s per slug.
const PREWARM_EDGE_OPTS = { maxAttempts: 1, timeoutMs: 2500 } as const;

type SlugRow = { slug: string; tenant_id: string; base_lang: string };

type CronSummary = {
    event: "prewarm_snapshots_cron";
    n_total: number;
    n_warmed: number;
    n_skipped: number;
    n_failed: number;
    // Lingue extra "vive" (Testa B): coppie (slug, lang≠base) scoperte in Redis
    // e rinfrescate KEEP-TTL. n_extra_total = coppie scoperte per gli slug del
    // giro; warmed = riscritte; failed = errore resolve/write. Le "skipped"
    // (chiave sparita mid-flight) = total - warmed - failed.
    n_extra_total: number;
    n_extra_warmed: number;
    n_extra_failed: number;
    durationMs: number;
    offset: number;
    limit: number | null;
};

function isAuthorized(req: VercelRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers["authorization"];
    if (typeof header !== "string") return false;
    const match = header.match(/^Bearer\s+(.+)$/);
    if (!match) return false;
    return timingSafeCompare(match[1], secret);
}

/** Parse intero non-negativo da query param; null se assente/invalido. */
function parseNonNegInt(raw: unknown): number | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string") return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Chiama la RPC SECURITY DEFINER via REST con la service key (l'EXECUTE è
 * concesso solo a service_role). Nessun SDK: `fetch` nativo, coerente con
 * supabaseEdge.ts. Lancia se env mancante o RPC non-2xx.
 */
async function fetchActiveSlugs(): Promise<SlugRow[]> {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    }
    const base = url.replace(/\/+$/, "");
    const response = await fetch(`${base}/rest/v1/rpc/list_active_public_slugs`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
        },
        body: "{}"
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`RPC list_active_public_slugs failed: ${response.status} ${text}`);
    }
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
        (r): r is SlugRow =>
            !!r && typeof r === "object" && typeof (r as SlugRow).slug === "string"
    );
}

/**
 * Worker-pool a concorrenza fissa. Non lancia mai (ogni errore per-slug è già
 * assorbito da snapshotPublicCatalog → "failed"). Aggrega i contatori.
 */
async function warmAll(
    slugs: string[],
    counters: { warmed: number; skipped: number; failed: number }
): Promise<void> {
    let cursor = 0;
    const worker = async (): Promise<void> => {
        while (cursor < slugs.length) {
            const slug = slugs[cursor++];
            const outcome = await snapshotPublicCatalog({ slug }, PREWARM_EDGE_OPTS);
            if (outcome === "written") counters.warmed++;
            else if (outcome === "skipped") counters.skipped++;
            else counters.failed++;
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, () => worker())
    );
}

type ExtraPair = { slug: string; lang: string };

/**
 * Scopre le coppie (slug, lang-extra) "vive" via `SCAN` su Redis: una chiave
 * `...:{slug}:{lang}` con lang≠base esiste SOLO se quella lingua è stata
 * visitata entro il TTL (il pre-warm base non le tocca) → la presenza È il
 * segnale di traffico. Nessuna lettura di `tenant_languages`: auto-selezione.
 *
 * `SCAN` (cursore, NON `KEYS` che blocca il server). Filtra a `activeSlugs`
 * (solo gli slug di questo giro) ed esclude il segmento base. Il timeout reale
 * per iterazione è applicato dal `signal` del client Upstash → un Redis appeso
 * lancia e il chiamante fa fail-open (salta la fase extra, il giro base resta).
 */
async function scanExtraPairs(activeSlugs: Set<string>): Promise<ExtraPair[]> {
    const match = snapshotKeyMatchPattern();
    const pairs: ExtraPair[] = [];
    const seen = new Set<string>();
    let cursor: string | number = 0;
    do {
        const [next, keys] = await getRedis().scan(cursor, { match, count: 250 });
        cursor = next;
        for (const key of keys) {
            const parsed = parseSnapshotKey(key);
            if (!parsed) continue;
            if (parsed.langPart === BASE_LANG_PART) continue;
            if (!activeSlugs.has(parsed.slug)) continue;
            const dedupe = `${parsed.slug}:${parsed.langPart}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            pairs.push({ slug: parsed.slug, lang: parsed.langPart });
        }
    } while (String(cursor) !== "0");
    return pairs;
}

/**
 * Rinfresca (KEEP-TTL) le lingue extra vive. Fail-OPEN sullo `scan`: se Redis è
 * irraggiungibile/lento, salta l'intera fase — il giro base è già completato,
 * nessun 5xx. Fail-SOFT per coppia: un errore conta e prosegue.
 */
async function warmExtraLangs(
    activeSlugs: Set<string>,
    counters: { extraTotal: number; extraWarmed: number; extraFailed: number }
): Promise<void> {
    let pairs: ExtraPair[];
    try {
        pairs = await scanExtraPairs(activeSlugs);
    } catch (e) {
        console.error(
            JSON.stringify({
                event: "prewarm_snapshots_extra_scan_failed",
                error: e instanceof Error ? e.message : String(e)
            })
        );
        return; // fail-open: base già fatto, extra saltate
    }
    counters.extraTotal = pairs.length;
    if (pairs.length === 0) return;

    let cursor = 0;
    const worker = async (): Promise<void> => {
        while (cursor < pairs.length) {
            const { slug, lang } = pairs[cursor++];
            const outcome = await snapshotPublicCatalog(
                { slug, lang, keepTtl: true },
                PREWARM_EDGE_OPTS
            );
            if (outcome === "written") counters.extraWarmed++;
            else if (outcome === "failed") counters.extraFailed++;
            // "skipped" (chiave sparita mid-flight, xx no-op) → né warmed né failed
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, () => worker())
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const startedAt = Date.now();

    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    if (!isAuthorized(req)) {
        res.setHeader("Cache-Control", "no-store");
        res.status(401).json({ error: "unauthorized" });
        return;
    }

    const offset = parseNonNegInt(req.query.offset) ?? 0;
    const limit = parseNonNegInt(req.query.limit); // null = tutti

    let allSlugs: string[];
    try {
        const rows = await fetchActiveSlugs();
        allSlugs = rows.map((r) => r.slug);
    } catch (e) {
        res.setHeader("Cache-Control", "no-store");
        console.error(
            JSON.stringify({
                event: "prewarm_snapshots_cron_error",
                error: e instanceof Error ? e.message : String(e),
                durationMs: Date.now() - startedAt
            })
        );
        res.status(500).json({ error: "slug_list_unavailable" });
        return;
    }

    const slice = limit === null ? allSlugs.slice(offset) : allSlugs.slice(offset, offset + limit);

    const counters = { warmed: 0, skipped: 0, failed: 0 };
    await warmAll(slice, counters);

    // Fase 2 (Testa B): rinfresca le lingue extra vive già calde in Redis,
    // KEEP-TTL, limitate agli slug di questo giro. Fail-open interno.
    const extra = { extraTotal: 0, extraWarmed: 0, extraFailed: 0 };
    await warmExtraLangs(new Set(slice), extra);

    const body: CronSummary = {
        event: "prewarm_snapshots_cron",
        n_total: slice.length,
        n_warmed: counters.warmed,
        n_skipped: counters.skipped,
        n_failed: counters.failed,
        n_extra_total: extra.extraTotal,
        n_extra_warmed: extra.extraWarmed,
        n_extra_failed: extra.extraFailed,
        durationMs: Date.now() - startedAt,
        offset,
        limit
    };
    console.log(JSON.stringify(body));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(body);
}
