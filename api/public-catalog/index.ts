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
        res.status(405).json({ error: "method_not_allowed" });
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
        res.status(400).json({ error: "missing_slug" });
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
        res.status(400).json({ error: "invalid_lang" });
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
        // Propaga il body originale dell'edge function (può contenere `error`
        // come stringa italiana). Il frontend già parsa quel formato.
        res.status(edgeResult.status).json(edgeResult.body ?? { error: "domain_error" });
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
    res.status(503).json({
        error: "service_unavailable",
        message: "Resolver upstream unavailable and no cached snapshot found"
    });
}
