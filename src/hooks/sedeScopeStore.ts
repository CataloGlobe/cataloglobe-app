// ============================================================
// useSedeScope — storage primitive + pure resolver.
//
// Lo stato "sede attiva" della navbar è condiviso tra tutte le
// pagine sede-scoped (orders, reservations, tables, analytics,
// reviews). Persistenza: `sessionStorage` con chiave namespaced
// per tenant. Sync intra-tab: subscriber set module-level (no
// Context/Provider, evita prop-drilling e re-render cascata).
//
// File splittato dalla parte React per consentire test unitari
// in environment `node` (vitest.config.ts → environment: "node")
// senza richiedere `@testing-library/react`.
// ============================================================

export const SCOPE_ALL = "__all__" as const;

export type SedeScopeValue = string | typeof SCOPE_ALL;

/** Pagine sede-scoped che consumeranno l'hook. "scheduling" è
 *  ESCLUSO per design (avrà un filtro sede in toolbar, non lo
 *  scope navbar). */
export const SEDE_SCOPED_ROUTES = [
    "orders",
    "reservations",
    "tables",
    "analytics",
    "reviews"
] as const;

export type SedeScopedRoute = (typeof SEDE_SCOPED_ROUTES)[number];

const STORAGE_PREFIX = "cataloglobe:sedeScope:";

function storageKey(tenantId: string): string {
    return `${STORAGE_PREFIX}${tenantId}`;
}

const listeners = new Set<() => void>();

/** Subscribe a cambi di sedeScope per QUALSIASI tenant. Il
 *  caller filtra per tenantId leggendo lo snapshot. */
export function subscribeSedeScope(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notify(): void {
    for (const l of listeners) l();
}

/** Legge il valore salvato per il tenant, o `null` se assente.
 *  Side-effect free, no notify. */
export function readSedeScope(tenantId: string): SedeScopeValue | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(storageKey(tenantId));
        if (!raw) return null;
        return raw as SedeScopeValue;
    } catch {
        return null;
    }
}

/** Scrive il valore e notifica tutti i subscriber. Sessione
 *  ignorata se sessionStorage non disponibile (SSR / privacy). */
export function writeSedeScope(tenantId: string, value: SedeScopeValue): void {
    if (typeof window !== "undefined") {
        try {
            window.sessionStorage.setItem(storageKey(tenantId), value);
        } catch {
            /* best effort */
        }
    }
    notify();
}

/** Rimuove l'entry e notifica. Utile per test/cleanup. */
export function clearSedeScope(tenantId: string): void {
    if (typeof window !== "undefined") {
        try {
            window.sessionStorage.removeItem(storageKey(tenantId));
        } catch {
            /* best effort */
        }
    }
    notify();
}

// ----------------------------------------------------------------------------
// Pure resolver — derivazione `value + isForcedSingleSite`.
// ----------------------------------------------------------------------------

export interface ResolveSedeScopeParams {
    storedValue: SedeScopeValue | null;
    readableActivityIds: readonly string[];
}

export interface ResolveSedeScopeResult {
    value: SedeScopeValue;
    isForcedSingleSite: boolean;
}

/**
 * Regole:
 *  - 1 sola sede leggibile → forzata, `isForcedSingleSite=true`
 *  - 0 sedi leggibili → `SCOPE_ALL` (placeholder, UI nasconde il selettore)
 *  - >1 sedi: se `storedValue` è valido (SCOPE_ALL OR id ∈ readable) → usa quello
 *  - >1 sedi: altrimenti default `SCOPE_ALL`
 */
export function resolveSedeScope(params: ResolveSedeScopeParams): ResolveSedeScopeResult {
    const { storedValue, readableActivityIds } = params;

    if (readableActivityIds.length === 1) {
        return { value: readableActivityIds[0], isForcedSingleSite: true };
    }

    if (readableActivityIds.length === 0) {
        return { value: SCOPE_ALL, isForcedSingleSite: false };
    }

    if (storedValue === SCOPE_ALL) {
        return { value: SCOPE_ALL, isForcedSingleSite: false };
    }

    if (storedValue && readableActivityIds.includes(storedValue)) {
        return { value: storedValue, isForcedSingleSite: false };
    }

    return { value: SCOPE_ALL, isForcedSingleSite: false };
}
