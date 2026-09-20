// ============================================================
// Mappa statica route → label IT. Fonte unica del nome di pagina: la
// consumano sia NavbarBreadcrumb/Sidebar sia il <title> del browser
// (MainLayout, via `businessRouteLabel`).
// ============================================================

/** Chiavi dei top-level segments delle route business. */
export type BusinessRouteKey =
    | "overview"
    | "locations"
    | "orders"
    | "reservations"
    | "scheduling"
    | "catalogs"
    | "products"
    | "featured"
    | "styles"
    | "languages"
    | "reviews"
    | "analytics"
    | "team"
    | "subscription"
    | "settings"
    | "guests"
    | "support"
    | "stories";

/** Route business su cui il SedeScopeSelect deve apparire nella navbar.
 *  Distinto dal concettuale `SEDE_SCOPED_ROUTES` (sedeScopeStore): qui
 *  c'è il sottoinsieme ATTUALMENTE migrato che consuma `useSedeScope`.
 *  Estendere man mano che si migrano altre pagine. */
export const SEDE_NAVBAR_ROUTES = new Set<BusinessRouteKey>([
    "reviews",
    "analytics",
    "scheduling",
    "reservations",
    "orders"
]);

/** Route che usano la modalità "sede singola" del primitivo sede-scope
 *  (mai SCOPE_ALL, persistenza localStorage). Sottoinsieme di
 *  `SEDE_NAVBAR_ROUTES` per le route con scope-all disabilitato. */
export const SEDE_SINGLE_SITE_ROUTES = new Set<BusinessRouteKey>([
    "orders"
]);

/** Label IT canonica per ogni voce di sidebar. Per le chiavi in
 *  `VERTICAL_LABEL_KEYS` (es. `catalogs`) il valore qui è solo fallback: usa
 *  `businessRouteLabel` sotto, mai questa mappa direttamente, per rispettare
 *  la verticale tenant (es. "Menu" vs "Catalogo"). */
export const ROUTE_LABELS: Record<BusinessRouteKey, string> = {
    overview: "Panoramica",
    locations: "Sedi",
    orders: "Ordini",
    reservations: "Prenotazioni",
    scheduling: "Programmazione",
    catalogs: "Cataloghi",
    products: "Prodotti",
    featured: "In evidenza",
    styles: "Stili",
    languages: "Lingue",
    reviews: "Recensioni",
    analytics: "Analitiche",
    team: "Team",
    subscription: "Abbonamento",
    settings: "Impostazioni",
    guests: "Clienti",
    support: "Assistenza",
    stories: "Storie"
};

/** Chiavi la cui label dipende dalla verticale del tenant (es. "Menu" vs
 *  "Catalogo" per un food & beverage vs altri verticali). Unica fonte di
 *  questa regola: aggiungere qui, non nei singoli reader. */
export const VERTICAL_LABEL_KEYS = new Set<BusinessRouteKey>(["catalogs"]);

/**
 * Label canonica di una route business. Per le chiavi in `VERTICAL_LABEL_KEYS`
 * ritorna `catalogLabel` se fornita (altrimenti il fallback in `ROUTE_LABELS`);
 * per tutte le altre ignora `catalogLabel` e ritorna sempre `ROUTE_LABELS[key]`.
 * Ogni lettore (breadcrumb, sidebar, <title>) passa da qui: è l'unico posto in
 * cui la regola del verticale può essere dimenticata.
 */
export function businessRouteLabel(key: BusinessRouteKey, options?: { catalogLabel?: string }): string {
    if (VERTICAL_LABEL_KEYS.has(key)) {
        return options?.catalogLabel ?? ROUTE_LABELS[key];
    }
    return ROUTE_LABELS[key];
}

export interface BusinessRouteInfo {
    /** Top-level key se la route è una pagina business riconosciuta; null se siamo
     *  fuori `/business/:id/*` o su un segmento non mappato. */
    key: BusinessRouteKey | null;
    /** Pathname della route lista corrispondente (es. `/business/abc/catalogs`).
     *  null se `key` è null. */
    basePath: string | null;
    /** True se la route è una sotto-route (es. `catalogs/:id`, `scheduling/featured/:ruleId`). */
    isDetail: boolean;
}

const ROUTE_KEYS = new Set<string>(Object.keys(ROUTE_LABELS));

/** Parsa il pathname e ritorna info sulla route business attiva. */
export function resolveBusinessRoute(pathname: string, businessId: string | undefined): BusinessRouteInfo {
    if (!businessId) return { key: null, basePath: null, isDetail: false };

    const prefix = `/business/${businessId}/`;
    if (!pathname.startsWith(prefix)) {
        return { key: null, basePath: null, isDetail: false };
    }

    const rest = pathname.slice(prefix.length);
    const segments = rest.split("/").filter(Boolean);
    const first = segments[0] ?? "";

    if (!ROUTE_KEYS.has(first)) {
        return { key: null, basePath: null, isDetail: false };
    }

    const key = first as BusinessRouteKey;
    return {
        key,
        basePath: `/business/${businessId}/${key}`,
        isDetail: segments.length > 1
    };
}
