import {
    getRedis,
    makeSnapshotKey,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_TTL_SECONDS
} from "./redis.js";
import {
    callResolvePublicCatalog,
    isHealthyPayload,
    type CallEdgeOptions,
    type PublicCatalogPayload
} from "./supabaseEdge.js";

/**
 * Esito di una singola operazione di snapshot:
 *   "written" — payload healthy, snapshot scritto in Redis
 *   "skipped" — upstream 200 ma non-healthy (sede inattiva / subscription /
 *               lang non supportata): deliberatamente NON cachato
 *   "failed"  — resolve in errore/timeout, oppure errore di scrittura Redis
 */
export type SnapshotOutcome = "written" | "skipped" | "failed";

type Snapshot = {
    schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
    savedAt: string;
    payload: PublicCatalogPayload;
};

/**
 * Resolve + (condizionale) write dello snapshot public-catalog per un
 * singolo slug/lang in Redis. Condiviso da:
 *   - `api/public-catalog/revalidate.ts` — ripopolo base DOPO il purge
 *   - il cron di pre-warming — ripopolo base senza purge
 *
 * Fail-soft: non lancia MAI. Il caller aggrega l'outcome. La scrittura usa
 * `getRedis().set` raw (non `redisSetSnapshot`) di proposito: serve distinguere
 * un write fallito (`"failed"`) da uno riuscito (`"written"`). Il timeout reale
 * della richiesta è comunque applicato dal `signal` del client Upstash
 * (`getRedis()`), quindi un Redis appeso aborta e cade nel catch → `"failed"`.
 */
export async function snapshotPublicCatalog(
    args: {
        slug: string;
        lang?: string;
    },
    opts?: CallEdgeOptions
): Promise<SnapshotOutcome> {
    const { slug, lang } = args;
    const edgeResult = await callResolvePublicCatalog({ slug, lang }, opts);

    if (edgeResult.kind !== "success") {
        console.warn(
            JSON.stringify({
                event: "snapshot_public_catalog_resolve_failed",
                slug,
                lang: lang ?? null,
                kind: edgeResult.kind,
                ...(edgeResult.kind === "domain_error" ? { status: edgeResult.status } : {}),
                ...(edgeResult.kind === "network_error"
                    ? {
                          cause:
                              edgeResult.cause instanceof Error
                                  ? edgeResult.cause.message
                                  : String(edgeResult.cause)
                      }
                    : {})
            })
        );
        return "failed";
    }

    if (!isHealthyPayload(edgeResult.payload)) {
        // Upstream valido ma non-healthy: non riscrivere la cache.
        return "skipped";
    }

    const snapshot: Snapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        payload: edgeResult.payload
    };
    try {
        await getRedis().set(makeSnapshotKey(slug, lang), snapshot, { ex: SNAPSHOT_TTL_SECONDS });
        return "written";
    } catch (e) {
        console.error(
            JSON.stringify({
                event: "snapshot_public_catalog_write_failed",
                slug,
                lang: lang ?? null,
                error: e instanceof Error ? e.message : String(e)
            })
        );
        return "failed";
    }
}
