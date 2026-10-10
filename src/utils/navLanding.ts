/**
 * I vecchi indirizzi della sede. Voci, gruppi e atterraggio stanno in
 * `navModel.ts` (§51); qui restano i `?tab=` della Scheda di prima delle
 * rotte di sede. Puro: nessun router, nessun DB.
 */

/**
 * I vecchi `?tab=` della scheda (sette valori più cinque legacy): portano
 * alla rotta giusta con `replace`, così i link in giro continuano a
 * funzionare (registro Sedi, chiusura 9; §29.2). Un valore sconosciuto apre
 * la Scheda; con `parte=` la sua parte a fuoco (Officina 3, C+++). La Sala ha la sua rotta;
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
    hours: { segment: "anagrafica", search: "parte=orari" },
    ordering: { segment: "anagrafica", search: "parte=ordini" },
    reservations: { segment: "anagrafica", search: "parte=prenotazioni" },
    settings: { segment: "anagrafica", search: "parte=link" },
    "hours-services": { segment: "anagrafica", search: "parte=offrite" },
    "access-control": { segment: "anagrafica", search: "parte=link" },
    sala: { segment: "servizio", search: "modo=sala" },
    tables: { segment: "servizio", search: "modo=sala" },
    service: { segment: "servizio", search: "modo=elenco" },
    availability: { segment: "cosa-vedono" }
};

export function legacyTabTarget(tab: string): LegacyTabTarget {
    return LEGACY_TAB_REDIRECT[tab] ?? { segment: "anagrafica" };
}
