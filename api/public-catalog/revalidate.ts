import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    getEnvNamespace,
    getRedis,
    makeSnapshotKey,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_TTL_SECONDS
} from "../_lib/redis.js";
import {
    callResolvePublicCatalog,
    isHealthyPayload,
    type PublicCatalogPayload
} from "../_lib/supabaseEdge.js";

/**
 * POST /api/public-catalog/revalidate
 *
 * Invalida la cache Redis per uno o più slug e ripopola subito lo snapshot
 * "base" (senza lang) chiamando `resolve-public-catalog`. In questo modo
 * il primo utente che arriva dopo non paga il roundtrip Supabase.
 *
 * Body:
 *   { "slug": "<slug>" }                    // singolo
 *   { "slugs": ["<slug1>", "<slug2>"] }     // batch (precedenza su `slug`)
 *
 * Auth:
 *   Header `Authorization: Bearer <REVALIDATE_SECRET>` obbligatorio.
 *
 * Granularità: cancella TUTTE le lingue dello slug (pattern
 * `cataloglobe:{env}:public-catalog:v1:<slug>:*`) — le traduzioni potrebbero
 * essere cambiate, evita mismatch tra lingue.
 */

type Snapshot = {
    schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
    savedAt: string;
    payload: PublicCatalogPayload;
};

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

function parseBody(body: unknown): { slugs: string[] } | { error: NormalizedErrorBody } {
    if (!body || typeof body !== "object") {
        return { error: err("invalid_body", "Body must be a JSON object") };
    }
    const obj = body as Record<string, unknown>;

    if (Array.isArray(obj.slugs)) {
        const cleaned: string[] = [];
        for (const s of obj.slugs) {
            if (typeof s !== "string") {
                return { error: err("invalid_slugs", "slugs must be an array of non-empty strings") };
            }
            const trimmed = s.trim();
            if (!trimmed || !SLUG_REGEX.test(trimmed)) {
                return { error: err("invalid_slugs", `Invalid slug: ${s}`) };
            }
            cleaned.push(trimmed);
        }
        if (cleaned.length === 0) {
            return { error: err("invalid_slugs", "slugs array is empty") };
        }
        // dedup preservando ordine
        return { slugs: Array.from(new Set(cleaned)) };
    }

    if (typeof obj.slug === "string") {
        const trimmed = obj.slug.trim();
        if (!trimmed || !SLUG_REGEX.test(trimmed)) {
            return { error: err("invalid_slug", `Invalid slug: ${obj.slug}`) };
        }
        return { slugs: [trimmed] };
    }

    return { error: err("missing_slug", "Provide `slug` (string) or `slugs` (string[])") };
}

function extractBearer(req: VercelRequest): string | null {
    const raw = req.headers["authorization"] ?? req.headers["Authorization"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || typeof header !== "string") return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
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

async function warmBaseSnapshot(slug: string, env: string): Promise<boolean> {
    const edgeResult = await callResolvePublicCatalog({ slug });
    if (edgeResult.kind !== "success") {
        console.warn(JSON.stringify({
            event: "public_catalog_revalidate_warm_failed",
            slug,
            env,
            kind: edgeResult.kind,
            ...(edgeResult.kind === "domain_error" ? { status: edgeResult.status } : {}),
            ...(edgeResult.kind === "network_error"
                ? { cause: edgeResult.cause instanceof Error ? edgeResult.cause.message : String(edgeResult.cause) }
                : {})
        }));
        return false;
    }

    if (!isHealthyPayload(edgeResult.payload)) {
        // Risposta upstream è valida ma non-healthy (inattiva, subscription, ecc.):
        // non riscrivere la cache. La cancellazione precedente basta.
        return false;
    }

    const snapshot: Snapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        payload: edgeResult.payload
    };
    try {
        const redis = getRedis();
        await redis.set(makeSnapshotKey(slug, undefined), snapshot, { ex: SNAPSHOT_TTL_SECONDS });
        return true;
    } catch (e) {
        console.error(JSON.stringify({
            event: "public_catalog_revalidate_write_failed",
            slug,
            env,
            error: e instanceof Error ? e.message : String(e)
        }));
        return false;
    }
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

    const expectedSecret = process.env.REVALIDATE_SECRET;
    if (!expectedSecret) {
        res.setHeader("Cache-Control", "no-store");
        console.error(JSON.stringify({
            event: "public_catalog_revalidate_misconfigured",
            env,
            reason: "REVALIDATE_SECRET env var missing"
        }));
        res.status(500).json(err("server_misconfigured", "REVALIDATE_SECRET not set"));
        return;
    }

    const presentedToken = extractBearer(req);
    if (!presentedToken || presentedToken !== expectedSecret) {
        res.setHeader("Cache-Control", "no-store");
        log({
            event: "public_catalog_revalidate",
            slugs: [],
            outcomes: [],
            durationMs: Date.now() - startedAt,
            status: 401,
            env
        });
        res.status(401).json(err("unauthorized"));
        return;
    }

    const parsed = parseBody(req.body);
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

    const outcomes: RevalidateOutcome[] = [];

    // Processa in parallelo gli slug; ognuno è indipendente.
    await Promise.all(
        parsed.slugs.map(async slug => {
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
                freshSnapshotSaved = await warmBaseSnapshot(slug, env);
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
        slugs: parsed.slugs,
        outcomes,
        durationMs: Date.now() - startedAt,
        status: 200,
        env
    });

    if (parsed.slugs.length === 1) {
        res.status(200).json({ revalidated: outcomes[0] });
        return;
    }
    res.status(200).json({ revalidated: outcomes });
}
