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
    cachedClient = new Redis({ url, token });
    return cachedClient;
}

export function getEnvNamespace(): string {
    return process.env.VERCEL_ENV ?? "local";
}

export function makeSnapshotKey(slug: string, lang: string | undefined): string {
    const langPart = lang ?? "__base__";
    return `cataloglobe:${getEnvNamespace()}:public-catalog:v1:${slug}:${langPart}`;
}
