// ============================================================
// Mappa statica route → label IT per il NavbarBreadcrumb.
//
// Una sola fonte locale al refactor header: NON sostituisce
// `PAGE_TITLES` in MainLayout (usata per il <title> del browser)
// finché il cleanup finale del refactor non le unifica.
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
    | "settings";

/** Route business su cui il SedeScopeSelect deve apparire nella navbar.
 *  Distinto dal concettuale `SEDE_SCOPED_ROUTES` (sedeScopeStore): qui
 *  c'è il sottoinsieme ATTUALMENTE migrato che consuma `useSedeScope`.
 *  Estendere man mano che si migrano altre pagine. */
export const SEDE_NAVBAR_ROUTES = new Set<BusinessRouteKey>([
    "reviews",
    "analytics",
    "scheduling",
    "reservations"
]);

/** Label IT canonica per ogni voce di sidebar. Per `catalogs`
 *  il valore qui è solo fallback: il caller usa `useVerticalConfig().catalogLabel`
 *  per rispettare la verticale tenant (es. "Menu" vs "Catalogo"). */
export const ROUTE_LABELS: Record<BusinessRouteKey, string> = {
    overview: "Panoramica",
    locations: "Sedi",
    orders: "Ordini",
    reservations: "Prenotazioni",
    scheduling: "Programmazione",
    catalogs: "Cataloghi",
    products: "Prodotti",
    featured: "Contenuti in evidenza",
    styles: "Stili",
    languages: "Lingue",
    reviews: "Recensioni",
    analytics: "Analitiche",
    team: "Team",
    subscription: "Abbonamento",
    settings: "Impostazioni"
};

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
