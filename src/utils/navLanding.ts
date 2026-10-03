import { canDoOnActivity, type UserPermissions } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";

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
    /** Titolo del gruppo di sidebar. */
    group: string;
    /** Permesso chiesto su **questa** sede (`canDoOnActivity`). */
    permission: string;
    /** Gate di piano: la voce resta visibile col lucchetto, ma non ci si atterra. */
    requiresFeature?: PlanFeature;
    /** Altri segmenti che tengono accesa la voce (la Scheda, quattro pagine). */
    matchSegments?: string[];
}

export const SEDE_NAV_ENTRIES: readonly SedeNavEntry[] = [
    { segment: "comande", label: "Comande", group: "Servizio", permission: "orders.read", requiresFeature: "table_ordering" },
    // Lo Storico degli ordini: una voce, non più una tab di Comande (lotto B-a).
    { segment: "storico", label: "Storico", group: "Servizio", permission: "orders.read", requiresFeature: "table_ordering" },
    {
        segment: "prenotazioni",
        label: "Prenotazioni",
        group: "Servizio",
        permission: "reservations.read",
        requiresFeature: "table_reservation"
    },
    { segment: "sala", label: "Sala", group: "Servizio", permission: "tables.read" },
    // «Cosa vedono i clienti» (§19, M7): legge chi legge la sede; scrive chi
    // ha `activity.manage`, lo stesso permesso delle RLS (D2, §50.14).
    { segment: "cosa-vedono", label: "Cosa vedono i clienti", group: "Clienti", permission: "activity.read" },
    {
        segment: "anagrafica",
        label: "Scheda",
        group: "Il locale",
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
            canDoOnActivity(permissions, entry.permission, activityId) &&
            (!entry.requiresFeature || hasFeature(entry.requiresFeature))
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
 * l'Anagrafica.
 */
const LEGACY_TAB_REDIRECT: Record<string, { segment: string; hash?: string }> = {
    profile: { segment: "anagrafica" },
    info: { segment: "anagrafica" },
    media: { segment: "anagrafica" },
    hours: { segment: "orari" },
    ordering: { segment: "ordini-prenotazioni", hash: "ordini" },
    reservations: { segment: "ordini-prenotazioni", hash: "prenotazioni" },
    settings: { segment: "pubblicazione" },
    "hours-services": { segment: "pubblicazione" },
    "access-control": { segment: "pubblicazione" },
    sala: { segment: "sala" },
    tables: { segment: "sala" },
    availability: { segment: "cosa-vedono" }
};

export function legacyTabTarget(tab: string): { segment: string; hash?: string } {
    return LEGACY_TAB_REDIRECT[tab] ?? { segment: "anagrafica" };
}
