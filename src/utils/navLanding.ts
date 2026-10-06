/**
 * I vecchi indirizzi della sede. Voci, gruppi e atterraggio stanno in
 * `navModel.ts` (§51); qui restano i `?tab=` della Scheda di prima delle
 * rotte di sede. Puro: nessun router, nessun DB.
 */

/**
 * I vecchi `?tab=` della scheda (sette valori più cinque legacy): portano
 * alla rotta giusta con `replace`, così i link in giro continuano a
 * funzionare (registro Sedi, chiusura 9; §29.2). Un valore sconosciuto apre
 * l'Anagrafica. La Sala è una tab della Scheda (correzioni UI SV3);
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
    ordering: { segment: "ordini-al-tavolo" },
    reservations: { segment: "prenotazioni-online" },
    settings: { segment: "pubblicazione" },
    "hours-services": { segment: "pubblicazione" },
    "access-control": { segment: "pubblicazione" },
    sala: { segment: "sala" },
    tables: { segment: "sala" },
    service: { segment: "servizio", search: "modo=elenco" },
    availability: { segment: "cosa-vedono" }
};

export function legacyTabTarget(tab: string): LegacyTabTarget {
    return LEGACY_TAB_REDIRECT[tab] ?? { segment: "anagrafica" };
}
