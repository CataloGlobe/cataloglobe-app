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
 *               lang non supportata): deliberatamente NON cachato. In modalità
 *               `keepTtl` anche: chiave non più presente (scaduta / mai esistita)
 *               → NON ricreata (no resurrezione di lingue morte).
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
        /**
         * Modalità "rinfresca preservando la scadenza" (Testa B, lingue extra).
         * Riscrive lo snapshot SOLO se la chiave è già presente, mantenendone il
         * TTL residuo (write `SET … XX PX <residuo>`) invece del TTL pieno.
         * Effetto: la scadenza resta ancorata all'ultima visita reale (che scrive
         * a TTL pieno) → la lingua si auto-pota quando il traffico si ferma.
         * Chiave assente (scaduta / mai vista) → `"skipped"` senza resolve (no
         * resurrezione, e nessuna chiamata edge sprecata). `xx` copre la race tra
         * la lettura del `pttl` e la write.
         * Default (assente/false): write a TTL pieno, comportamento invariato.
         */
        keepTtl?: boolean;
    },
    opts?: CallEdgeOptions
): Promise<SnapshotOutcome> {
    const { slug, lang, keepTtl } = args;
    const key = makeSnapshotKey(slug, lang);

    // keep-ttl: pre-check del TTL residuo PRIMA del resolve. Se la chiave è
    // sparita (pttl -2) o senza scadenza (pttl -1, non atteso per le extra) →
    // skip: non resuscitare una lingua morta, e risparmia la chiamata edge.
    let residualMs: number | null = null;
    if (keepTtl) {
        try {
            const pttl = await getRedis().pttl(key);
            if (typeof pttl !== "number" || pttl <= 0) {
                return "skipped";
            }
            residualMs = pttl;
        } catch (e) {
            console.error(
                JSON.stringify({
                    event: "snapshot_public_catalog_pttl_failed",
                    slug,
                    lang: lang ?? null,
                    error: e instanceof Error ? e.message : String(e)
                })
            );
            return "failed";
        }
    }

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
        if (keepTtl && residualMs !== null) {
            // SET … XX PX <residuo>: rinfresca il contenuto SOLO se la chiave
            // esiste ancora (xx), preservando la scadenza (px = residuo). Se è
            // scaduta durante il resolve, `set` è no-op → null → "skipped".
            const r = await getRedis().set(key, snapshot, { px: residualMs, xx: true });
            return r === null ? "skipped" : "written";
        }
        await getRedis().set(key, snapshot, { ex: SNAPSHOT_TTL_SECONDS });
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
