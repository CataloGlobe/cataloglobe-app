import { Redis } from "@upstash/redis";

/**
 * Singleton Upstash Redis client + helper di namespacing.
 *
 * Upstash piano Free condivide UN SOLO database tra Production / Preview /
 * Development → tutte le chiavi DEVONO essere prefisso-isolate per
 * ambiente, altrimenti dati di sviluppo inquinano la cache di produzione.
 *
 * Schema chiave:
 *   cataloglobe:{env}:public-catalog:v1:{slug}:{lang_or_base}
 *
 * - `{env}` = `process.env.VERCEL_ENV` (production | preview | development);
 *   fallback "local" quando undefined (locale via `vercel dev` o `npm run dev`).
 * - `v1` = schema dello snapshot. Bump al cambio di forma del payload.
 * - `{lang_or_base}` = lang URL (lowercase) o literal `__base__` se omessa.
 */

const TTL_DAYS = 30;
export const SNAPSHOT_TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Timeout applicativo (ms) per ogni operazione Redis. Il client Upstash è REST
 * su `fetch`: passato come `signal: () => AbortSignal.timeout(ms)` al costruttore
 * aborta davvero la richiesta (nessuna fetch dangling nel lambda) e lancia
 * `TimeoutError`. Configurabile via env `REDIS_TIMEOUT_MS`; default 1500ms
 * (~100× la latenza tipica get/set same-region → non falsa-scatta, ma taglia lo
 * stallo se Upstash è degradato). Redis è il layer di fallback quando Supabase è
 * down: senza questo cap una `get` lenta stallerebbe il render.
 */
export function getRedisTimeoutMs(): number {
    const raw = process.env.REDIS_TIMEOUT_MS;
    if (!raw) return DEFAULT_TIMEOUT_MS;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

let cachedClient: Redis | null = null;

export function getRedis(): Redis {
    if (cachedClient) return cachedClient;
    const url = process.env.REDIS_KV_REST_API_URL;
    const token = process.env.REDIS_KV_REST_API_TOKEN;
    if (!url || !token) {
        throw new Error(
            "Missing Upstash env vars: REDIS_KV_REST_API_URL / REDIS_KV_REST_API_TOKEN"
        );
    }
    // `signal` è una factory chiamata per-request → ogni op ottiene un
    // AbortSignal fresco con il budget corrente.
    cachedClient = new Redis({
        url,
        token,
        signal: () => AbortSignal.timeout(getRedisTimeoutMs())
    });
    return cachedClient;
}

/**
 * GET fail-open. Su `TimeoutError`/errore Redis → log strutturato `redis_timeout`
 * + ritorna `null` (semanticamente identico a un cache-miss: il flusso di
 * fallback del caller prosegue senza snapshot). MAI throw. L'abort reale della
 * richiesta è applicato dal `signal` del client.
 */
export async function redisGetSnapshot<T>(key: string): Promise<T | null> {
    const startedAt = Date.now();
    try {
        return await getRedis().get<T>(key);
    } catch (err) {
        console.error(
            JSON.stringify({
                event: "redis_timeout",
                op: "get",
                key,
                ms: getRedisTimeoutMs(),
                durationMs: Date.now() - startedAt,
                error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            })
        );
        return null;
    }
}

/**
 * SET fail-open (best-effort). Su `TimeoutError`/errore → log `redis_timeout` +
 * no-op silenzioso. MAI bloccare o ritardare la response del caller.
 */
export async function redisSetSnapshot(
    key: string,
    value: unknown,
    ttlSeconds: number
): Promise<void> {
    const startedAt = Date.now();
    try {
        await getRedis().set(key, value, { ex: ttlSeconds });
    } catch (err) {
        console.error(
            JSON.stringify({
                event: "redis_timeout",
                op: "set",
                key,
                ms: getRedisTimeoutMs(),
                durationMs: Date.now() - startedAt,
                error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            })
        );
    }
}

export function getEnvNamespace(): string {
    return process.env.VERCEL_ENV ?? "local";
}

/** Literal `langPart` usato per la lingua base (nessun segmento lingua in URL). */
export const BASE_LANG_PART = "__base__";

export function makeSnapshotKey(slug: string, lang: string | undefined): string {
    const langPart = lang ?? BASE_LANG_PART;
    return `cataloglobe:${getEnvNamespace()}:public-catalog:v1:${slug}:${langPart}`;
}

/**
 * Glob per `SCAN MATCH` di tutte le chiavi snapshot dell'env corrente.
 * Centralizzato qui perché lo schema chiave vive in `makeSnapshotKey`:
 * l'unico posto che conosce il prefisso.
 */
export function snapshotKeyMatchPattern(): string {
    return `cataloglobe:${getEnvNamespace()}:public-catalog:v1:*`;
}

/**
 * Parsa una chiave snapshot dell'env corrente in `{ slug, langPart }`.
 * `null` se la chiave non appartiene allo schema/env (difensivo: SCAN può
 * restituire chiavi di altri prefissi se il pattern venisse allargato).
 * Nota: gli slug non contengono `:` (hyphenated) e `langPart` è l'ultimo
 * segmento → split sull'ultimo `:`.
 */
export function parseSnapshotKey(key: string): { slug: string; langPart: string } | null {
    const prefix = `cataloglobe:${getEnvNamespace()}:public-catalog:v1:`;
    if (!key.startsWith(prefix)) return null;
    const rest = key.slice(prefix.length);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0 || lastColon === rest.length - 1) return null;
    return { slug: rest.slice(0, lastColon), langPart: rest.slice(lastColon + 1) };
}
