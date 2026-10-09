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
    | "calendario"
    | "programmazione"
    | "styles"
    | "featured"
    | "stories"
    | "languages"
    | "servizio"
    | "sala"
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
    /**
     * La query della parte (`vista=calendario`, `modo=sala`): due parti sulla
     * stessa pagina. Con la query la parte è accesa solo se l'indirizzo la
     * porta; senza, quando nessuna sorella con la query lo è.
     */
    search?: string;
    /**
     * Una parte dell'azienda con la sua gemella dentro la sede (Calendario,
     * Andamento, Recensioni): con una sede in vista porta alla sede, sotto
     * questo segmento; senza, alla pagina dell'azienda (tutte le sedi).
     */
    sedeSegment?: string;
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
    /** La parte sceglie le sedi diversamente dalla sua sezione (Storico: anche tutte). */
    seat?: NavSeatKind;
    /** Qui «Confronta con» vale (D152): Calendario, Andamento. */
    confronto?: boolean;
    /** La label segue la verticale dell'azienda (`catalogLabel`). */
    verticalLabel?: boolean;
}

/**
 * Le sei sezioni della sidebar (navigazione nuova, artifact v4 approvato da
 * Alex il 2026-10-09): sempre le stesse, con una sede o con trenta.
 */
export type NavGroupKey = "overview" | "crea" | "calendario" | "servizio" | "numeri" | "sedi";

/**
 * Le sedi in alto a destra nella pagina, secondo la sezione: `none` è
 * dell'azienda (nessuna scelta), `multi` più sedi insieme (oggi: tutte o una),
 * `one` una sede alla volta, `list` l'elenco delle sedi.
 */
export type NavSeatKind = "none" | "multi" | "one" | "list";

export interface NavGroup {
    key: NavGroupKey;
    /** Il nome della sezione; con una parte sola è il nome del link. */
    title: string;
    seat: NavSeatKind;
    /** Le parti (al massimo cinque, un livello solo). Una sola: link diretto. */
    entries: NavEntry[];
}

/**
 * Le sedi in alto a destra per la parte aperta (D152): il tipo di scelta
 * della sezione, o quello della parte, e se «Confronta con» vale. In
 * Servizio una sede sola, ma lo Storico anche tutte (Alex 2026-10-09).
 */
export function seatOf(group: NavGroup, entry?: NavEntry | null): { seat: NavSeatKind; confronto: boolean } {
    const seat = entry?.seat ?? group.seat;
    return { seat, confronto: seat === "multi" && !!entry?.confronto };
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
    end: true,
    // Una sede aperta (la sua Scheda) è ancora «Sedi».
    matchSegments: ["anagrafica", "come-lavorate", "orari", "ordini-al-tavolo", "prenotazioni-online", "pubblicazione"]
};

const SCHEDA: NavEntry = {
    key: "anagrafica",
    label: "Scheda",
    level: "sede",
    segment: "anagrafica",
    gate: { on: "activity", permission: "activity.read" },
    matchSegments: ["come-lavorate", "orari", "ordini-al-tavolo", "prenotazioni-online", "pubblicazione"]
};

// «Cosa vedono i clienti» (§19, M7): legge chi legge la sede; scrive chi ha
// `activity.manage`, lo stesso permesso delle RLS (D2, §50.14).
const COSA_VEDONO: NavEntry = {
    seat: "one",
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

// Calendario e Regole: la stessa pagina della Programmazione, la vista dalla
// query. Dentro una sede la Programmazione della sede.
const CALENDARIO: NavEntry = {
    confronto: true,
    key: "calendario",
    label: "Calendario",
    level: "azienda",
    segment: "scheduling",
    search: "vista=calendario",
    sedeSegment: "programmazione",
    gate: { on: "anyActivity", permission: "scheduling.read" }
};

const SCHEDULING: NavEntry = {
    key: "scheduling",
    label: "Regole",
    level: "azienda",
    segment: "scheduling",
    sedeSegment: "programmazione",
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
    label: "In servizio",
    level: "sede",
    segment: "servizio",
    // Prenotazioni e Comande stanno dentro «In servizio» (primo giro: pagine
    // loro, la parte resta accesa).
    matchSegments: ["prenotazioni", "comande"],
    gate: { on: "activityCheck", check: canSeeServizio },
    // Niente lucchetto sulla voce: la Sala c'è su ogni piano, Elenco e Mappa
    // hanno il loro dentro la pagina.
    usable: (permissions, hasFeature, activityId) =>
        resolveServizioMode(null, permissions, hasFeature, activityId) !== null
};

// La sala da modificare (tavoli, zone, QR): oggi il modo `sala` di Servizio.
const SALA: NavEntry = {
    key: "sala",
    label: "Sala",
    level: "sede",
    segment: "servizio",
    search: "modo=sala",
    gate: { on: "activity", permission: "tables.read" }
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
    seat: "multi",
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
    confronto: true,
    key: "analytics",
    label: "Andamento",
    level: "azienda",
    segment: "analytics",
    sedeSegment: "analitiche",
    gate: { on: "anyActivity", permission: "analytics.read" }
};

const REVIEWS: NavEntry = {
    key: "reviews",
    label: "Recensioni",
    level: "azienda",
    segment: "reviews",
    sedeSegment: "recensioni",
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
    seat: "none",
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

// ── Le sezioni ──────────────────────────────────────────────────────────────
// Sei voci, sempre le stesse (artifact v4, Alex 2026-10-09): Panoramica, Menù
// e vetrina, Calendario, Servizio, Clienti e numeri, Sedi. Con una sede sola
// «Sedi» si chiama «Il locale» e porta alla sua Scheda.

const PANORAMICA: NavGroup = { key: "overview", title: "Panoramica", seat: "multi", entries: [OVERVIEW] };
const CREA: NavGroup = {
    key: "crea",
    title: "Menù e vetrina",
    seat: "none",
    entries: [CATALOGS, PRODUCTS, STYLES, FEATURED, STORIES]
};
const CALENDARIO_SEZIONE: NavGroup = {
    key: "calendario",
    title: "Calendario",
    seat: "multi",
    entries: [CALENDARIO, SCHEDULING, COSA_VEDONO]
};
const IN_SALA: NavGroup = { key: "servizio", title: "Servizio", seat: "one", entries: [SERVIZIO, SALA, STORICO] };
const NUMERI: NavGroup = {
    key: "numeri",
    title: "Clienti e numeri",
    seat: "multi",
    entries: [ANALYTICS, REVIEWS, GUESTS]
};
const SEDI: NavGroup = { key: "sedi", title: "Sedi", seat: "list", entries: [LOCATIONS] };
const IL_LOCALE: NavGroup = { key: "sedi", title: "Il locale", seat: "none", entries: [{ ...SCHEDA, label: "Il locale" }] };

const SECTIONS = [PANORAMICA, CREA, CALENDARIO_SEZIONE, IN_SALA, NUMERI];

export const NAV_MODELS: Record<NavContext, NavModel> = {
    unica: { groups: [...SECTIONS, IL_LOCALE] },
    azienda: { groups: [...SECTIONS, SEDI] },
    sede: { groups: [...SECTIONS, SEDI] }
};

/**
 * Il menù dell'account, in fondo alla sidebar (Officina, come in Claude):
 * le pagine dell'azienda che non sono lavoro di tutti i giorni. Uguale in
 * tutti i contesti: sono dell'azienda, anche dentro una sede.
 */
/** La sezione e la parte da chiave (le voci della sidebar portano `id = entry.key`). */
export function navPart(groupKey: string | undefined, entryKey: string | undefined): { group: NavGroup; entry: NavEntry } | null {
    if (!groupKey || !entryKey) return null;
    for (const model of Object.values(NAV_MODELS)) {
        const group = model.groups.find(g => g.key === groupKey);
        const entry = group?.entries.find(e => e.key === entryKey);
        if (group && entry) return { group, entry };
    }
    return null;
}

export const ACCOUNT_ENTRIES: readonly NavEntry[] = [SETTINGS, TEAM, BILLING, LANGUAGES, SUPPORT];

/**
 * Le pagine che vivono sotto una sede: per il cambio di sede e le briciole.
 * La Scheda prima; poi Servizio, che è dove si atterra entrando.
 */
const SEDE_ENTRIES: readonly NavEntry[] = [
    SCHEDA,
    COSA_VEDONO,
    PROGRAMMAZIONE_SEDE,
    SERVIZIO,
    PRENOTAZIONI,
    COMANDE,
    STORICO,
    ANALITICHE,
    RECENSIONI
];

/** Le pagine del lavoro in sala, nell'ordine in cui si atterra. */
const OPERATIVE_ENTRIES: readonly NavEntry[] = [SERVIZIO, PRENOTAZIONI, COMANDE, STORICO];

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
    if (gate.on === "anyActivity") {
        // La gemella di sede chiede il permesso su quella sede.
        if (entry.sedeSegment && activityId) return canDoOnActivity(permissions, gate.permission, activityId);
        return canDoOnAnyActivity(permissions, gate.permission);
    }
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

/**
 * L'indirizzo di una voce. Le voci di sede chiedono la sede; una parte
 * dell'azienda con la gemella (`sedeSegment`) va nella sede quando c'è.
 */
export function entryPath(entry: NavEntry, businessId: string, activityId: string | null): string {
    const query = entry.search ? `?${entry.search}` : "";
    if (entry.level === "sede") return `/business/${businessId}/locations/${activityId ?? ""}/${entry.segment}${query}`;
    if (entry.sedeSegment && activityId) {
        return `/business/${businessId}/locations/${activityId}/${entry.sedeSegment}${query}`;
    }
    return `/business/${businessId}/${entry.segment}${query}`;
}

/** La voce di sede a cui appartiene un segmento sotto `/locations/:id/` (la Scheda ne ha quattro). */
export function navEntryForSedeSegment(segment: string | null | undefined): NavEntry | null {
    if (!segment) return null;
    // Prima la pagina col suo segmento (Comande), poi chi la tiene accesa (In servizio).
    return (
        SEDE_ENTRIES.find(e => e.segment === segment) ??
        SEDE_ENTRIES.find(e => e.matchSegments?.includes(segment)) ??
        null
    );
}

// ── Atterraggio (§51.6) ─────────────────────────────────────────────────────

/** Chi configura: owner, admin e chi gestisce almeno una sede. */
export function isConfigurator(permissions: UserPermissions): boolean {
    return isOwnerOrAdmin(permissions) || canDoOnAnyActivity(permissions, "activity.manage");
}

/**
 * Entrando in una sede. Chi la gestisce parte dalla Scheda; staff e viewer
 * dalla prima voce di Operatività che possono usare (chi legge i tavoli ha
 * almeno la Sala di Servizio, su ogni piano), altrimenti la Scheda.
 */
export function sedeLandingSegment(permissions: UserPermissions, hasFeature: HasFeature, activityId: string): string {
    if (isOwnerOrAdmin(permissions) || canDoOnActivity(permissions, "activity.manage", activityId)) {
        return SEDE_FALLBACK_SEGMENT;
    }
    const first = OPERATIVE_ENTRIES.find(e => isNavEntryUsable(e, permissions, hasFeature, activityId));
    return first ? first.segment : SEDE_FALLBACK_SEGMENT;
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
