import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    getEnvNamespace,
    getRedis,
    makeSnapshotKey,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_TTL_SECONDS
} from "../_lib/redis";
import {
    callResolvePublicCatalog,
    isHealthyPayload,
    type PublicCatalogPayload
} from "../_lib/supabaseEdge";

/**
 * GET /api/public-catalog?slug=<slug>&lang=<lang>?
 *
 * Endpoint serverless di resilienza davanti a `resolve-public-catalog`
 * (Supabase Edge Function). Strategia:
 *
 *   1. Chiama edge function Supabase con retry/timeout.
 *   2. Su payload healthy → snapshot in Upstash Redis (TTL 30g) + restituisce live.
 *   3. Su errore di rete dopo tutti i retry → fallback su snapshot Redis se valido.
 *   4. Su errore dominio (4xx) → propaga al client senza fallback.
 *   5. Su rete down + nessuno snapshot → 503 strutturato.
 *
 * Snapshot Redis key (namespaced per env Vercel):
 *   cataloglobe:{env}:public-catalog:v1:{slug}:{lang_or_base}
 */

type Snapshot = {
    schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
    savedAt: string;
    payload: PublicCatalogPayload;
};

const LANG_REGEX = /^[a-z]{2}(-[a-z]{2,4})?$/i;

/**
 * Contratto di errore normalizzato emesso dall'endpoint /api/public-catalog.
 *
 * Shape stabile esposta al frontend:
 *   {
 *     "error": {
 *       "code": "<semantic>",       // routing client-side
 *       "messageKey": "<i18n key>", // chiave i18n public.json (es. "page.loading_error")
 *       "message": "<original>"     // opzionale, body originale upstream
 *     }
 *   }
 *
 * Codici:
 *   - method_not_allowed   (405)
 *   - missing_slug         (400) — slug query param assente
 *   - invalid_lang         (400) — lang query param mal formato
 *   - invalid_link         (400) — upstream ha risposto 400 (es. "Missing slug")
 *   - not_found            (404) — upstream "Sede non trovata"
 *   - domain_error         (4xx altri) — upstream errore non mappato
 *   - service_unavailable  (503) — upstream giù + nessuno snapshot in cache
 */
type NormalizedErrorBody = {
    error: {
        code: string;
        messageKey: string;
        message?: string;
    };
};

function normalizedError(code: string, messageKey: string, message?: string): NormalizedErrorBody {
    return { error: { code, messageKey, ...(message ? { message } : {}) } };
}

/**
 * Mappa una risposta di errore upstream (status + body) nella shape
 * normalizzata. Body upstream esempio: `{ "error": "Sede non trovata" }`.
 */
function mapUpstreamDomainError(status: number, body: unknown): NormalizedErrorBody {
    const rawMessage =
        body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? ((body as { error: string }).error)
            : undefined;

    if (status === 404) {
        return normalizedError("not_found", "page.error.not_found", rawMessage);
    }
    if (status === 400) {
        return normalizedError("invalid_link", "page.error.invalid_link", rawMessage);
    }
    return normalizedError("domain_error", "page.loading_error", rawMessage);
}

type LogRecord = {
    event: "public_catalog_fetch";
    slug: string;
    lang: string | null;
    source: "live" | "stale" | "domain_error" | "service_unavailable" | "bad_request" | "method_not_allowed";
    attemptsUsed: number;
    durationMs: number;
    status: number;
    env: string;
};

function log(rec: LogRecord): void {
    console.log(JSON.stringify(rec));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const startedAt = Date.now();
    const env = getEnvNamespace();

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_fetch",
            slug: "",
            lang: null,
            source: "method_not_allowed",
            attemptsUsed: 0,
            durationMs: Date.now() - startedAt,
            status: 405,
            env
        });
        res.status(405).json(normalizedError("method_not_allowed", "page.error.invalid_link"));
        return;
    }

    const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
    const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim() : "";

    if (!slug) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_fetch",
            slug: "",
            lang: langRaw || null,
            source: "bad_request",
            attemptsUsed: 0,
            durationMs: Date.now() - startedAt,
            status: 400,
            env
        });
        res.status(400).json(normalizedError("missing_slug", "page.error.invalid_link"));
        return;
    }

    if (langRaw && !LANG_REGEX.test(langRaw)) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_fetch",
            slug,
            lang: langRaw,
            source: "bad_request",
            attemptsUsed: 0,
            durationMs: Date.now() - startedAt,
            status: 400,
            env
        });
        res.status(400).json(normalizedError("invalid_lang", "page.error.invalid_lang"));
        return;
    }

    const lang = langRaw ? langRaw.toLowerCase() : undefined;
    const snapshotKey = makeSnapshotKey(slug, lang);

    const edgeResult = await callResolvePublicCatalog({ slug, lang });

    if (edgeResult.kind === "success") {
        const payload = edgeResult.payload;

        if (isHealthyPayload(payload)) {
            // Best-effort write: il fallimento Redis NON deve bloccare la risposta live
            const snapshot: Snapshot = {
                schemaVersion: SNAPSHOT_SCHEMA_VERSION,
                savedAt: new Date().toISOString(),
                payload
            };
            try {
                const redis = getRedis();
                await redis.set(snapshotKey, snapshot, { ex: SNAPSHOT_TTL_SECONDS });
            } catch (err) {
                console.error(JSON.stringify({
                    event: "public_catalog_redis_write_failed",
                    slug,
                    lang: lang ?? null,
                    env,
                    error: err instanceof Error ? err.message : String(err)
                }));
            }
        }

        res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
        res.setHeader("X-Cataloglobe-Source", "live");
        log({
            event: "public_catalog_fetch",
            slug,
            lang: lang ?? null,
            source: "live",
            attemptsUsed: edgeResult.attempts,
            durationMs: Date.now() - startedAt,
            status: 200,
            env
        });
        res.status(200).json(payload);
        return;
    }

    if (edgeResult.kind === "domain_error") {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_fetch",
            slug,
            lang: lang ?? null,
            source: "domain_error",
            attemptsUsed: edgeResult.attempts,
            durationMs: Date.now() - startedAt,
            status: edgeResult.status,
            env
        });
        res.status(edgeResult.status).json(mapUpstreamDomainError(edgeResult.status, edgeResult.body));
        return;
    }

    // network_error → fallback Redis
    console.error(JSON.stringify({
        event: "public_catalog_network_error",
        slug,
        lang: lang ?? null,
        attempts: edgeResult.attempts,
        env,
        cause: edgeResult.cause instanceof Error ? edgeResult.cause.message : String(edgeResult.cause)
    }));

    let snapshot: Snapshot | null = null;
    try {
        const redis = getRedis();
        const cached = await redis.get<Snapshot>(snapshotKey);
        if (
            cached &&
            typeof cached === "object" &&
            (cached as Snapshot).schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
            typeof (cached as Snapshot).savedAt === "string" &&
            (cached as Snapshot).payload
        ) {
            snapshot = cached as Snapshot;
        }
    } catch (err) {
        console.error(JSON.stringify({
            event: "public_catalog_redis_read_failed",
            slug,
            lang: lang ?? null,
            env,
            error: err instanceof Error ? err.message : String(err)
        }));
    }

    if (snapshot) {
        res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=60");
        res.setHeader("X-Cataloglobe-Source", "stale");
        res.setHeader("X-Cataloglobe-Stale-Since", snapshot.savedAt);
        log({
            event: "public_catalog_fetch",
            slug,
            lang: lang ?? null,
            source: "stale",
            attemptsUsed: edgeResult.attempts,
            durationMs: Date.now() - startedAt,
            status: 200,
            env
        });
        res.status(200).json(snapshot.payload);
        return;
    }

    res.setHeader("Cache-Control", "no-store");
    log({
        event: "public_catalog_fetch",
        slug,
        lang: lang ?? null,
        source: "service_unavailable",
        attemptsUsed: edgeResult.attempts,
        durationMs: Date.now() - startedAt,
        status: 503,
        env
    });
    res.status(503).json(
        normalizedError(
            "service_unavailable",
            "page.loading_error",
            "Resolver upstream unavailable and no cached snapshot found"
        )
    );
}
