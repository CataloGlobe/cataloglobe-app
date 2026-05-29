import type { PublicCatalogPayload } from "./fetchPublicCatalog";

/**
 * Cache localStorage del payload `resolve-public-catalog` per `slug+lang`.
 *
 * Pensata come fallback offline-soft: se la rete fallisce dopo tutti i retry
 * e abbiamo uno snapshot recente in cache, lo mostriamo con un banner di
 * "dati potenzialmente non aggiornati".
 *
 * Tutte le operazioni sono best-effort: `localStorage` può essere assente
 * (SSR, iframe sandbox), pieno (quota exceeded), o disabilitato (Safari
 * private mode pre-15). In tutti questi casi degradiamo silenziosamente.
 */

// Bump v2: aggiunto business.ordering_enabled al payload server-side
// (maintenance mode mid-session Fix 1). Cache v1 → orphaned in storage,
// nuove letture vanno solo a v2.
const SCHEMA_VERSION = 2 as const;
const KEY_PREFIX = `cataloglobe:public-menu:v${SCHEMA_VERSION}`;
const TTL_MS = 7 * 24 * 60 * 60 * 1_000; // 7 giorni

type CacheEntry = {
    payload: PublicCatalogPayload;
    savedAt: string;
    schemaVersion: typeof SCHEMA_VERSION;
};

function isStorageAvailable(): boolean {
    try {
        if (typeof window === "undefined") return false;
        const probeKey = `${KEY_PREFIX}:__probe__`;
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        return true;
    } catch {
        return false;
    }
}

function makeKey(slug: string, lang: string | undefined): string {
    const langPart = lang ?? "__base__";
    return `${KEY_PREFIX}:${slug}:${langPart}`;
}

function isCacheKey(key: string): boolean {
    return key.startsWith(`${KEY_PREFIX}:`) && !key.endsWith(":__probe__");
}

function safeRemove(key: string): void {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function entryFromRaw(raw: string | null): CacheEntry | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<CacheEntry>;
        if (
            parsed &&
            parsed.schemaVersion === SCHEMA_VERSION &&
            typeof parsed.savedAt === "string" &&
            parsed.payload &&
            typeof parsed.payload === "object"
        ) {
            return parsed as CacheEntry;
        }
        return null;
    } catch {
        return null;
    }
}

function isFresh(entry: CacheEntry): boolean {
    const savedAtMs = Date.parse(entry.savedAt);
    if (Number.isNaN(savedAtMs)) return false;
    return Date.now() - savedAtMs < TTL_MS;
}

function pruneStaleEntries(): void {
    if (!isStorageAvailable()) return;
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !isCacheKey(key)) continue;
            const entry = entryFromRaw(window.localStorage.getItem(key));
            if (!entry || !isFresh(entry)) {
                keysToRemove.push(key);
            }
        }
        for (const key of keysToRemove) safeRemove(key);
    } catch {
        // ignore
    }
}

function purgeAllCacheKeys(): void {
    if (!isStorageAvailable()) return;
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && isCacheKey(key)) keysToRemove.push(key);
        }
        for (const key of keysToRemove) safeRemove(key);
    } catch {
        // ignore
    }
}

export type CachedSnapshot = {
    payload: PublicCatalogPayload;
    savedAt: Date;
};

export function getCached(slug: string, lang: string | undefined): CachedSnapshot | null {
    if (!isStorageAvailable()) return null;
    const key = makeKey(slug, lang);
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(key);
    } catch {
        return null;
    }
    const entry = entryFromRaw(raw);
    if (!entry) {
        if (raw !== null) safeRemove(key); // corrupted JSON / old schema
        return null;
    }
    if (!isFresh(entry)) {
        safeRemove(key);
        return null;
    }
    return { payload: entry.payload, savedAt: new Date(entry.savedAt) };
}

export function setCached(slug: string, lang: string | undefined, payload: PublicCatalogPayload): void {
    if (!isStorageAvailable()) return;
    const key = makeKey(slug, lang);
    const entry: CacheEntry = {
        payload,
        savedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION
    };
    const serialized = JSON.stringify(entry);

    try {
        window.localStorage.setItem(key, serialized);
    } catch (err) {
        // quota piena: prova svuotando le entries scadute e ritenta una volta
        pruneStaleEntries();
        try {
            window.localStorage.setItem(key, serialized);
        } catch {
            // ancora pieno: ultimo tentativo dopo aver svuotato tutte le entries del namespace
            purgeAllCacheKeys();
            try {
                window.localStorage.setItem(key, serialized);
            } catch {
                console.debug("[publicCatalogCache] setCached giving up after quota errors", err);
            }
        }
    }

    // pulizia opportunistica delle entries scadute (non-blocking)
    pruneStaleEntries();
}

export function clearCached(slug: string, lang: string | undefined): void {
    if (!isStorageAvailable()) return;
    safeRemove(makeKey(slug, lang));
}
