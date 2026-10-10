import {
    canDoOnActivity,
    canDoOnAnyActivity,
    canDoOnTenant,
    isOwnerOrAdmin,
    type UserPermissions
} from "@/lib/permissions";
import { passesPlanGate, type PlanFeature, type PlanGate } from "@/lib/planFeatures";
import { ROUTE_LABELS } from "@/components/layout/AppHeader/navbarBreadcrumbRoutes";
import { canSeeServizio, resolveServizioMode } from "@/utils/servizioModes";

/**
 * Il modello della navigazione (§51). Puro: niente router, niente React,
 * niente DB. Descrive **una volta** gruppi, voci, ordine, gate e segnali
 * dei tre contesti, e risolve dove si atterra. Sidebar, header e redirect
 * leggono da qui: «la prima voce usabile, nell'ordine della sidebar» resta
 * una regola sola.
 *
 * File nuovo e non un'estensione di `navLanding.ts`: lì vivevano le sole voci
 * della sede; qui stanno i tre contesti. `navLanding.ts` tiene i vecchi
 * `?tab=` della Scheda.
 *
 * Tre contesti, dalle sedi **che chi guarda può leggere** (§51.2):
 * - `unica` — una sede: un elenco solo, nessun contesto in cui entrare;
 * - `azienda` — più sedi (o nessuna), fuori da una sede;
 * - `sede` — più sedi, dentro una sede.
 */

export type NavContext = "unica" | "azienda" | "sede";

export type NavKey =
    | "overview"
    | "locations"
    | "anagrafica"
    | "cosa-vedono"
    | "catalogs"
    | "products"
    | "scheduling"
    | "programmazione"
    | "styles"
    | "featured"
    | "stories"
    | "languages"
    | "servizio"
    | "prenotazioni"
    | "comande"
    | "storico"
    | "analytics"
    | "reviews"
    | "analitiche"
    | "recensioni"
    | "guests"
    | "settings"
    | "team"
    | "billing"
    | "support";

/** I segnali di oggi (§51.15): li calcola il layout, la voce dice quale le spetta. */
export type NavSignal = "translations" | "import" | "supportUnread";

type HasFeature = (feature: PlanFeature) => boolean;

/**
 * Come si chiede il permesso: sull'azienda (`canDoOnTenant`), su almeno una
 * sede (`canDoOnAnyActivity`) o su **questa** sede (`canDoOnActivity`; con
 * un elenco ne basta uno).
 */
export type NavGate =
    | { on: "tenant"; permission: string }
    | { on: "anyActivity"; permission: string }
    | { on: "activity"; permission: string | readonly string[] }
    /** Una regola che non è un solo permesso (Servizio: i permessi di un modo). */
    | { on: "activityCheck"; check: (permissions: UserPermissions, activityId: string) => boolean };

export interface NavEntry {
    key: NavKey;
    /** Etichetta; per `catalogs` è il fallback di `catalogLabel` (verticale). */
    label: string;
    /** Dove vive l'indirizzo: sotto l'azienda o sotto la sede. */
    level: "azienda" | "sede";
    /** Segmento sotto `/business/:businessId/` o `/locations/:activityId/`. */
    segment: string;
    /** Senza gate la voce si vede sempre. */
    gate?: NavGate;
    /** Gate di piano: la voce resta visibile col lucchetto, ma non ci si atterra. */
    requiresFeature?: PlanGate;
    /**
     * Per una voce a più modi (Servizio): si atterra solo se almeno un modo
     * si può usare. Vedere la voce non basta.
     */
    usable?: (permissions: UserPermissions, hasFeature: HasFeature, activityId: string) => boolean;
    /** Altri segmenti (stesso livello) che tengono accesa la voce: la Scheda, quattro pagine. */
    matchSegments?: string[];
    /** `NavLink end`: la voce si accende solo sul suo indirizzo esatto. */
    end?: boolean;
    signal?: NavSignal;
    /** La label segue la verticale dell'azienda (`catalogLabel`). */
    verticalLabel?: boolean;
}

/** Le sezioni della sidebar (Officina): ognuna ha la sua icona. */
export type NavGroupKey = "locale" | "menu" | "vetrina" | "servizio" | "clienti";

export interface NavGroup {
    /** Senza chiave il gruppo non è una sezione: le sue voci stanno sciolte. */
    key?: NavGroupKey;
    /** `null` = fuori gruppo (§19.5: un gruppo di una voce sola non raggruppa niente). */
    title: string | null;
    entries: NavEntry[];
}

export interface NavModel {
    groups: NavGroup[];
}

// ── Le voci ─────────────────────────────────────────────────────────────────

const OVERVIEW: NavEntry = { key: "overview", label: ROUTE_LABELS.overview, level: "azienda", segment: "overview", end: true };

const LOCATIONS: NavEntry = {
    key: "locations",
    label: ROUTE_LABELS.locations,
    level: "azienda",
    segment: "locations",
    gate: { on: "anyActivity", permission: "activity.read" },
    end: true
};

const SCHEDA: NavEntry = {
    key: "anagrafica",
    label: "Scheda",
    level: "sede",
    segment: "anagrafica",
    gate: { on: "activity", permission: "activity.read" },
    matchSegments: ["orari", "ordini-al-tavolo", "prenotazioni-online", "sala", "pubblicazione"]
};

// «Cosa vedono i clienti» (§19, M7): legge chi legge la sede; scrive chi ha
// `activity.manage`, lo stesso permesso delle RLS (D2, §50.14).
const COSA_VEDONO: NavEntry = {
    key: "cosa-vedono",
    label: "Cosa vedono i clienti",
    level: "sede",
    segment: "cosa-vedono",
    gate: { on: "activity", permission: "activity.read" }
};

// Programmazione della sede (T9b, PG6; supera §51.11): le regole che
// raggiungono questa sede, viste da dentro. Le regole restano dell'azienda;
// stesso componente, la sede dal path. Staff non ha `scheduling.read`.
const PROGRAMMAZIONE_SEDE: NavEntry = {
    key: "programmazione",
    label: ROUTE_LABELS.scheduling,
    level: "sede",
    segment: "programmazione",
    gate: { on: "activity", permission: "scheduling.read" }
};

const CATALOGS: NavEntry = {
    key: "catalogs",
    label: ROUTE_LABELS.catalogs,
    level: "azienda",
    segment: "catalogs",
    gate: { on: "tenant", permission: "catalogs.read" },
    signal: "import",
    verticalLabel: true
};

const PRODUCTS: NavEntry = {
    key: "products",
    label: ROUTE_LABELS.products,
    level: "azienda",
    segment: "products",
    gate: { on: "tenant", permission: "products.read" }
};

const SCHEDULING: NavEntry = {
    key: "scheduling",
    label: ROUTE_LABELS.scheduling,
    level: "azienda",
    segment: "scheduling",
    gate: { on: "anyActivity", permission: "scheduling.read" }
};

const STYLES: NavEntry = {
    key: "styles",
    label: ROUTE_LABELS.styles,
    level: "azienda",
    segment: "styles",
    gate: { on: "tenant", permission: "styles.read" }
};

const FEATURED: NavEntry = {
    key: "featured",
    label: ROUTE_LABELS.featured,
    level: "azienda",
    segment: "featured",
    gate: { on: "anyActivity", permission: "featured.read" }
};

const STORIES: NavEntry = {
    key: "stories",
    label: ROUTE_LABELS.stories,
    level: "azienda",
    segment: "stories",
    gate: { on: "anyActivity", permission: "stories.read" }
};

// Lingue resta pagina propria (§50.14 L1): traduce il catalogo. Officina:
// esce dalla sidebar e sta nel menù dell'account (`ACCOUNT_ENTRIES`).
const LANGUAGES: NavEntry = {
    key: "languages",
    label: ROUTE_LABELS.languages,
    level: "azienda",
    segment: "languages",
    gate: { on: "tenant", permission: "catalogs.read" },
    signal: "translations"
};

// Servizio (§18.2): la sala del momento, coi suoi modi. La vede chi legge i
// tavoli o le tavolate; ci si atterra solo se un modo si può usare.
const SERVIZIO: NavEntry = {
    key: "servizio",
    label: "Servizio",
    level: "sede",
    segment: "servizio",
    gate: { on: "activityCheck", check: canSeeServizio },
    // Col piano Base tutti i suoi modi hanno il lucchetto (la Sala è nella Scheda, SV3).
    requiresFeature: ["table_reservation", "table_ordering"],
    usable: (permissions, hasFeature, activityId) =>
        resolveServizioMode(null, permissions, hasFeature, activityId) !== null
};

const PRENOTAZIONI: NavEntry = {
    key: "prenotazioni",
    label: "Prenotazioni",
    level: "sede",
    segment: "prenotazioni",
    gate: { on: "activity", permission: "reservations.read" },
    requiresFeature: "table_reservation"
};

const COMANDE: NavEntry = {
    key: "comande",
    label: "Comande",
    level: "sede",
    segment: "comande",
    gate: { on: "activity", permission: "orders.read" },
    requiresFeature: "table_ordering"
};

const STORICO: NavEntry = {
    key: "storico",
    label: "Storico",
    level: "sede",
    segment: "storico",
    gate: { on: "activity", permission: "orders.read" },
    requiresFeature: "table_ordering"
};

// Andamento a due livelli (§51.10): il totale delle sedi leggibili fuori,
// la sede dentro. Stesso componente, la sede dal path.
const ANALYTICS: NavEntry = {
    key: "analytics",
    label: ROUTE_LABELS.analytics,
    level: "azienda",
    segment: "analytics",
    gate: { on: "anyActivity", permission: "analytics.read" }
};

const REVIEWS: NavEntry = {
    key: "reviews",
    label: ROUTE_LABELS.reviews,
    level: "azienda",
    segment: "reviews",
    gate: { on: "anyActivity", permission: "reviews.read" }
};

const ANALITICHE: NavEntry = {
    key: "analitiche",
    label: ROUTE_LABELS.analytics,
    level: "sede",
    segment: "analitiche",
    gate: { on: "activity", permission: "analytics.read" }
};

const RECENSIONI: NavEntry = {
    key: "recensioni",
    label: ROUTE_LABELS.reviews,
    level: "sede",
    segment: "recensioni",
    gate: { on: "activity", permission: "reviews.read" }
};

// La rubrica è di tutta l'azienda (§6, §51.11). Il gate di piano resta
// `table_reservation` finché le prenotazioni sono l'unica sorgente dei profili.
const GUESTS: NavEntry = {
    key: "guests",
    label: ROUTE_LABELS.guests,
    level: "azienda",
    segment: "guests",
    gate: { on: "anyActivity", permission: "guests.read" },
    requiresFeature: "table_reservation"
};

// Azienda · Team · Abbonamento (§51.12): ogni tab col suo gate, la voce no.
// Nel menù dell'account Team e Abbonamento sono voci a sé, coi gate delle
// loro tab (`useSettingsTabs`).
const SETTINGS: NavEntry = { key: "settings", label: ROUTE_LABELS.settings, level: "azienda", segment: "settings" };

const TEAM: NavEntry = {
    key: "team",
    label: "Team",
    level: "azienda",
    segment: "settings/team",
    gate: { on: "tenant", permission: "team.read" }
};

const BILLING: NavEntry = {
    key: "billing",
    label: "Abbonamento",
    level: "azienda",
    segment: "settings/abbonamento",
    gate: { on: "tenant", permission: "billing.read" }
};

// "Assistenza" e non "Aiuto": è un canale verso una persona. Gate su
// `canDoOnTenant`, più largo delle RLS: un manager senza sedi deve poter
// arrivare alla pagina, dove trova l'email con cui chiedere aiuto.
const SUPPORT: NavEntry = {
    key: "support",
    label: ROUTE_LABELS.support,
    level: "azienda",
    segment: "support",
    gate: { on: "tenant", permission: "support.read" },
    signal: "supportUnread"
};

// ── I gruppi ────────────────────────────────────────────────────────────────
// Ordine (§51.5): prima il locale, poi cosa offre, poi il lavoro in sala, poi
// i risultati. Servizio non sta in cima perché è del piano Pro.
// Titoli dell'Officina (sidebar approvata da Alex il 2026-10-08): Menù,
// Vetrina, Servizio, Clienti e numeri; stessi titoli in tutti i contesti.

const IL_LOCALE: NavGroup = { key: "locale", title: "Il locale", entries: [SCHEDA, COSA_VEDONO] };
const MENU: NavGroup = { key: "menu", title: "Menù", entries: [CATALOGS, PRODUCTS, SCHEDULING] };
const VETRINA: NavGroup = { key: "vetrina", title: "Vetrina", entries: [STYLES, FEATURED, STORIES] };
const IN_SALA: NavGroup = { key: "servizio", title: "Servizio", entries: [SERVIZIO, PRENOTAZIONI, COMANDE, STORICO] };
const CLIENTI_E_NUMERI = "Clienti e numeri";

export const NAV_MODELS: Record<NavContext, NavModel> = {
    unica: {
        groups: [
            { title: null, entries: [OVERVIEW] },
            IL_LOCALE,
            MENU,
            VETRINA,
            IN_SALA,
            { key: "clienti", title: CLIENTI_E_NUMERI, entries: [ANALITICHE, RECENSIONI, GUESTS] }
        ]
    },
    azienda: {
        groups: [
            { title: null, entries: [OVERVIEW, LOCATIONS] },
            MENU,
            VETRINA,
            { key: "clienti", title: CLIENTI_E_NUMERI, entries: [ANALYTICS, REVIEWS, GUESTS] }
        ]
    },
    sede: {
        groups: [
            { key: "locale", title: IL_LOCALE.title, entries: [...IL_LOCALE.entries, PROGRAMMAZIONE_SEDE] },
            IN_SALA,
            { key: "clienti", title: CLIENTI_E_NUMERI, entries: [ANALITICHE, RECENSIONI] }
        ]
    }
};

/**
 * Il menù dell'account, in fondo alla sidebar (Officina, come in Claude):
 * le pagine dell'azienda che non sono lavoro di tutti i giorni. Uguale in
 * tutti i contesti: sono dell'azienda, anche dentro una sede.
 */
export const ACCOUNT_ENTRIES: readonly NavEntry[] = [SETTINGS, TEAM, BILLING, LANGUAGES, SUPPORT];

/** Le voci che vivono sotto una sede, nell'ordine della sidebar della sede. */
const SEDE_ENTRIES: readonly NavEntry[] = NAV_MODELS.sede.groups.flatMap(g => g.entries);

/** Dove si va quando nessuna voce è usabile: la Scheda dice il perché. */
export const SEDE_FALLBACK_SEGMENT = SCHEDA.segment;

// ── Contesto ────────────────────────────────────────────────────────────────

/**
 * Il contesto dalle sedi leggibili (§51.2). `null` = elenco non ancora
 * arrivato: decide il percorso, così la sidebar non resta vuota.
 */
export function resolveNavContext(readableCount: number | null, inSedePath: boolean): NavContext {
    if (readableCount === null) return inSedePath ? "sede" : "azienda";
    if (readableCount === 1) return "unica";
    if (readableCount >= 2 && inSedePath) return "sede";
    return "azienda";
}

// ── Voci ────────────────────────────────────────────────────────────────────

/**
 * Il permesso di una voce. Una voce di sede senza sede (`activityId` null)
 * non si vede: non c'è una sede su cui chiederlo.
 */
export function canSeeNavEntry(entry: NavEntry, permissions: UserPermissions, activityId: string | null): boolean {
    const gate = entry.gate;
    if (!gate) return true;
    if (gate.on === "tenant") return canDoOnTenant(permissions, gate.permission);
    if (gate.on === "anyActivity") return canDoOnAnyActivity(permissions, gate.permission);
    if (!activityId) return false;
    if (gate.on === "activityCheck") return gate.check(permissions, activityId);
    const list = typeof gate.permission === "string" ? [gate.permission] : gate.permission;
    return list.some(p => canDoOnActivity(permissions, p, activityId));
}

/** Si vede **e** si usa: niente lucchetto del piano, almeno un modo aperto. */
export function isNavEntryUsable(
    entry: NavEntry,
    permissions: UserPermissions,
    hasFeature: HasFeature,
    activityId: string
): boolean {
    return (
        canSeeNavEntry(entry, permissions, activityId) &&
        passesPlanGate(entry.requiresFeature, hasFeature) &&
        (!entry.usable || entry.usable(permissions, hasFeature, activityId))
    );
}

/** L'indirizzo di una voce. Le voci di sede chiedono la sede. */
export function entryPath(entry: NavEntry, businessId: string, activityId: string | null): string {
    if (entry.level === "sede") return `/business/${businessId}/locations/${activityId ?? ""}/${entry.segment}`;
    return `/business/${businessId}/${entry.segment}`;
}

/** La voce di sede a cui appartiene un segmento sotto `/locations/:id/` (la Scheda ne ha quattro). */
export function navEntryForSedeSegment(segment: string | null | undefined): NavEntry | null {
    if (!segment) return null;
    return SEDE_ENTRIES.find(e => e.segment === segment || e.matchSegments?.includes(segment)) ?? null;
}

// ── Atterraggio (§51.6) ─────────────────────────────────────────────────────

/** Chi configura: owner, admin e chi gestisce almeno una sede. */
export function isConfigurator(permissions: UserPermissions): boolean {
    return isOwnerOrAdmin(permissions) || canDoOnAnyActivity(permissions, "activity.manage");
}

/**
 * Entrando in una sede. Chi la gestisce parte dalla Scheda; staff e viewer
 * dalla prima voce di Operatività che possono usare. Nessuna: la Sala se
 * leggono i tavoli (era il modo «Gestisci la sala» di Servizio, dove
 * atterravano col piano Base; correzioni UI SV3), altrimenti la Scheda.
 */
export function sedeLandingSegment(permissions: UserPermissions, hasFeature: HasFeature, activityId: string): string {
    if (isOwnerOrAdmin(permissions) || canDoOnActivity(permissions, "activity.manage", activityId)) {
        return SEDE_FALLBACK_SEGMENT;
    }
    const first = IN_SALA.entries.find(e => isNavEntryUsable(e, permissions, hasFeature, activityId));
    if (first) return first.segment;
    return canDoOnActivity(permissions, "tables.read", activityId) ? "sala" : SEDE_FALLBACK_SEGMENT;
}

/**
 * L'ingresso nell'azienda (`/business/:businessId`). Chi configura: la
 * Panoramica. Gli altri: con una sede, la sua prima voce di Operatività; con
 * più sedi, Sedi per scegliere il locale. Nessuna sede: la Panoramica.
 */
export function businessHomePath(
    businessId: string,
    permissions: UserPermissions,
    hasFeature: HasFeature,
    readableActivityIds: readonly string[]
): string {
    const b = `/business/${businessId}`;
    if (readableActivityIds.length === 0 || isConfigurator(permissions)) return `${b}/overview`;
    if (readableActivityIds.length === 1) {
        const id = readableActivityIds[0];
        return `${b}/locations/${id}/${sedeLandingSegment(permissions, hasFeature, id)}`;
    }
    return `${b}/locations`;
}

/**
 * Cambiare sede dal selettore (§51.7): resta sulla stessa pagina se nella
 * sede nuova si può usare, altrimenti si atterra come entrando.
 */
export function switchSedePath(
    currentSegment: string | null,
    businessId: string,
    activityId: string,
    permissions: UserPermissions,
    hasFeature: HasFeature
): string {
    const base = `/business/${businessId}/locations/${activityId}`;
    const entry = navEntryForSedeSegment(currentSegment);
    if (currentSegment && entry && isNavEntryUsable(entry, permissions, hasFeature, activityId)) {
        return `${base}/${currentSegment}`;
    }
    return `${base}/${sedeLandingSegment(permissions, hasFeature, activityId)}`;
}
