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
// senza richiedere `@testing-library/react`. La cache delle
// activities è in `activitiesCache.ts` (file separato perché
// importa il service Supabase che ha alias non risolto da vitest).
// ============================================================

export const SCOPE_ALL = "__all__" as const;

export type SedeScopeValue = string | typeof SCOPE_ALL;

/** Pagine sede-scoped che consumano l'hook. Contratto stabile per gating
 *  futuro; il sottoinsieme effettivamente migrato in navbar è in
 *  `SEDE_NAVBAR_ROUTES` (navbarBreadcrumbRoutes), che include anche
 *  `scheduling` benché qui non sia presente (preservato per evitare
 *  breakage del contratto storico). */
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
// Single-site mode — storage localStorage (cross-session) + resolver dedicato.
// Riusa lo STESSO pub/sub di sopra: un consumer single-site reagisce a write
// (locali o session) sullo stesso store globale tramite getSnapshot.
// La key NON è tenant-scoped per backward-compat col valore esistente del
// combobox Ordini (`cataloglobe:orders:lastActivityId`).
// ----------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = "cataloglobe:orders:lastActivityId";

/** Legge la sede salvata in localStorage (cross-session). Side-effect free. */
export function readSedeScopeLocal(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch {
        return null;
    }
}

/** Scrive in localStorage e notifica i subscriber (stesso pub/sub di
 *  `subscribeSedeScope`). Best-effort: ignora errori storage (SSR/privacy). */
export function writeSedeScopeLocal(value: string): void {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
        } catch {
            /* best effort */
        }
    }
    notify();
}

/** Rimuove l'entry localStorage e notifica. Utile per test/cleanup. */
export function clearSedeScopeLocal(): void {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(LOCAL_STORAGE_KEY);
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

/**
 * Resolver per la modalità "single-site": il valore risolto NON è mai
 * `SCOPE_ALL` (eccetto edge 0-sedi placeholder gestito dall'UI).
 *
 * Regole:
 *  - 0 sedi leggibili → `SCOPE_ALL` placeholder, `isForcedSingleSite=false`
 *  - 1 sede leggibile → forza l'unica sede, `isForcedSingleSite=true`
 *  - >1 sedi: `storedValue` valido (≠ SCOPE_ALL && ∈ readable) → quello
 *  - >1 sedi: altrimenti default = prima sede dell'array `readableActivityIds`
 */
export function resolveSedeScopeSingle(params: ResolveSedeScopeParams): ResolveSedeScopeResult {
    const { storedValue, readableActivityIds } = params;

    if (readableActivityIds.length === 0) {
        return { value: SCOPE_ALL, isForcedSingleSite: false };
    }

    if (readableActivityIds.length === 1) {
        return { value: readableActivityIds[0], isForcedSingleSite: true };
    }

    if (
        storedValue &&
        storedValue !== SCOPE_ALL &&
        readableActivityIds.includes(storedValue)
    ) {
        return { value: storedValue, isForcedSingleSite: false };
    }

    return { value: readableActivityIds[0], isForcedSingleSite: false };
}
