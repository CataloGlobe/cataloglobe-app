import { canDoOnActivity, type UserPermissions } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import { SERVIZIO_READ_PERMISSIONS, resolveServizioMode } from "@/utils/servizioModes";

/**
 * Dove si atterra (D1 §1, §46.1 f). Puro: nessun router, nessun DB. Le voci
 * della sidebar di sede vivono qui, in ordine, perché la sidebar e
 * l'atterraggio devono leggere lo stesso elenco: «la prima voce permessa,
 * nell'ordine della sidebar».
 */

export interface SedeNavEntry {
    /** Segmento sotto `/locations/:activityId/`. */
    segment: string;
    label: string;
    /**
     * Titolo del gruppo di sidebar; `null` = fuori gruppo (§19.5: un gruppo di
     * una voce sola è un titolo che non raggruppa niente).
     */
    group: string | null;
    /** Permesso chiesto su **questa** sede (`canDoOnActivity`); con un elenco, ne basta uno. */
    permission: string | readonly string[];
    /** Gate di piano: la voce resta visibile col lucchetto, ma non ci si atterra. */
    requiresFeature?: PlanFeature;
    /** Altri segmenti che tengono accesa la voce (la Scheda, quattro pagine). */
    matchSegments?: string[];
    /**
     * Per una voce a più modi (Servizio): si atterra solo se almeno un modo
     * si può usare. Vedere la voce non basta: un modo col lucchetto non è un
     * posto dove arrivare.
     */
    usable?: (permissions: UserPermissions, hasFeature: (feature: PlanFeature) => boolean, activityId: string) => boolean;
}

/** Il permesso di una voce, su questa sede: con un elenco ne basta uno. */
export function canSeeSedeEntry(permissions: UserPermissions, entry: SedeNavEntry, activityId: string): boolean {
    const list = typeof entry.permission === "string" ? [entry.permission] : entry.permission;
    return list.some(p => canDoOnActivity(permissions, p, activityId));
}

/**
 * Sei voci (§19.5, lotto B-b): **Ospiti** (Servizio · Prenotazioni) ·
 * **Ordini** (Comande · Storico) · Cosa vedono i clienti · Scheda, le ultime
 * due fuori gruppo.
 */
export const SEDE_NAV_ENTRIES: readonly SedeNavEntry[] = [
    // Servizio (§18.2): la sala del momento, coi suoi modi. Prima voce: è
    // dove si atterra. La vede chi legge i tavoli o le tavolate (D1).
    {
        segment: "servizio",
        label: "Servizio",
        group: "Ospiti",
        permission: SERVIZIO_READ_PERMISSIONS,
        usable: (permissions, hasFeature, activityId) =>
            resolveServizioMode(null, permissions, hasFeature, activityId) !== null
    },
    {
        segment: "prenotazioni",
        label: "Prenotazioni",
        group: "Ospiti",
        permission: "reservations.read",
        requiresFeature: "table_reservation"
    },
    { segment: "comande", label: "Comande", group: "Ordini", permission: "orders.read", requiresFeature: "table_ordering" },
    // Lo Storico degli ordini: una voce, non più una tab di Comande (lotto B-a).
    { segment: "storico", label: "Storico", group: "Ordini", permission: "orders.read", requiresFeature: "table_ordering" },
    // «Cosa vedono i clienti» (§19, M7): legge chi legge la sede; scrive chi
    // ha `activity.manage`, lo stesso permesso delle RLS (D2, §50.14).
    { segment: "cosa-vedono", label: "Cosa vedono i clienti", group: null, permission: "activity.read" },
    {
        segment: "anagrafica",
        label: "Scheda",
        group: null,
        permission: "activity.read",
        matchSegments: ["orari", "ordini-prenotazioni", "pubblicazione"]
    }
];

/** Dove si va quando nessuna voce è usabile: la pagina dice il perché. */
export const SEDE_FALLBACK_SEGMENT = "anagrafica";

/**
 * La prima voce della sede che chi guarda può aprire **e usare**: una voce
 * col lucchetto del piano si vede, ma non è il posto dove far atterrare.
 */
export function firstSedeSegment(
    permissions: UserPermissions,
    hasFeature: (feature: PlanFeature) => boolean,
    activityId: string,
    entries: readonly SedeNavEntry[] = SEDE_NAV_ENTRIES
): string {
    const usable = entries.find(
        entry =>
            canSeeSedeEntry(permissions, entry, activityId) &&
            (!entry.requiresFeature || hasFeature(entry.requiresFeature)) &&
            (!entry.usable || entry.usable(permissions, hasFeature, activityId))
    );
    return usable?.segment ?? SEDE_FALLBACK_SEGMENT;
}

/**
 * L'ingresso nell'azienda (D1): con una sola sede leggibile si entra nella
 * sede, che è dove si lavora; con più sedi, o nessuna, la Panoramica.
 */
export function businessHomePath(businessId: string, readableActivityIds: readonly string[]): string {
    if (readableActivityIds.length === 1) {
        return `/business/${businessId}/locations/${readableActivityIds[0]}`;
    }
    return `/business/${businessId}/overview`;
}

/**
 * I vecchi `?tab=` della scheda (sette valori più cinque legacy): portano
 * alla rotta giusta con `replace`, così i link in giro continuano a
 * funzionare (registro Sedi, chiusura 9; §29.2). Un valore sconosciuto apre
 * l'Anagrafica. La Sala è il modo «Gestisci la sala» di Servizio (lotto B-a);
 * la sala del momento (`service`, era una scheda di Prenotazioni) è il modo
 * Elenco (lotto B-b).
 */
export interface LegacyTabTarget {
    segment: string;
    hash?: string;
    search?: string;
}

const LEGACY_TAB_REDIRECT: Record<string, LegacyTabTarget> = {
    profile: { segment: "anagrafica" },
    info: { segment: "anagrafica" },
    media: { segment: "anagrafica" },
    hours: { segment: "orari" },
    ordering: { segment: "ordini-prenotazioni", hash: "ordini" },
    reservations: { segment: "ordini-prenotazioni", hash: "prenotazioni" },
    settings: { segment: "pubblicazione" },
    "hours-services": { segment: "pubblicazione" },
    "access-control": { segment: "pubblicazione" },
    sala: { segment: "servizio", search: "modo=gestisci" },
    tables: { segment: "servizio", search: "modo=gestisci" },
    service: { segment: "servizio", search: "modo=elenco" },
    availability: { segment: "cosa-vedono" }
};

export function legacyTabTarget(tab: string): LegacyTabTarget {
    return LEGACY_TAB_REDIRECT[tab] ?? { segment: "anagrafica" };
}
