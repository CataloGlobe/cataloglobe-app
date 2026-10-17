// CRM, Fase 2 (F2-1): regole pure della base contatti per l'outreach.
// Zero import: la usano il frontend (alias @shared/) e le edge di F2-2.
//
// Punteggio di partenza con pochi segnali; i pesi sono una proposta da
// aggiornare su chi diventa cliente. Catene: un punto in più, mai in cima da
// sole; quelle da 3 sedi in su fuori dall'invio automatico (deciso da Alex il
// 2026-10-05: gavetta prima delle catene).

export type OutreachEmailCheck = "da_verificare" | "valida" | "rischiosa" | "non_valida";

export type OutreachExclusion = "catena_grande" | "gia_lead" | "gia_cliente" | "lista_stop" | "non_valida" | "a_mano";

export interface OutreachProspectSignals {
    email: string | null;
    phone_e164: string | null;
    instagram: string | null;
    website: string | null;
    email_check: OutreachEmailCheck;
    rating: number | null;
    reviews_count: number | null;
    has_online_menu: boolean | null;
    locations_count: number | null;
}

/**
 * All'inizio solo locali con una o due sedi: da 3 in su niente invio
 * automatico. Si alza a mano quando Alex ha fatto 10-15 lead in chiamata,
 * non dopo un tempo fisso (deciso da Alex il 2026-10-05).
 */
export const OUTREACH_LARGE_CHAIN_MIN_LOCATIONS = 3;

/** Stessa normalizzazione di crm_email_fingerprint e del trigger di guardia. */
export function normalizeOutreachEmail(email: string | null | undefined): string | null {
    const value = (email ?? "").trim().toLowerCase();
    return value === "" ? null : value;
}

export function isLargeChain(locationsCount: number | null): boolean {
    return locationsCount !== null && locationsCount >= OUTREACH_LARGE_CHAIN_MIN_LOCATIONS;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Punteggio di partenza, 0-100. Più alto = da contattare prima.
 * - base 40;
 * - recensioni (locale vivo): da 10 +5, da 50 +10, da 200 +15;
 * - voto: da 4,0 +5, da 4,3 +10;
 * - senza menù online +10 (è quello che offriamo); con menù online 0;
 * - più sedi sotto la soglia delle catene grandi +10, mai da solo in cima;
 * - sito +5;
 * - mail valida +10, rischiosa -15; non valida = 0, non si contatta.
 */
export function outreachStartScore(p: OutreachProspectSignals): number {
    if (p.email_check === "non_valida" && !p.phone_e164 && !p.instagram) return 0;
    let score = 40;
    const reviews = p.reviews_count ?? 0;
    if (reviews >= 200) score += 15;
    else if (reviews >= 50) score += 10;
    else if (reviews >= 10) score += 5;
    if (p.rating !== null) {
        if (p.rating >= 4.3) score += 10;
        else if (p.rating >= 4.0) score += 5;
    }
    if (p.has_online_menu === false) score += 10;
    if (p.locations_count !== null && p.locations_count >= 2 && !isLargeChain(p.locations_count)) score += 10;
    if (p.website) score += 5;
    if (p.email) {
        if (p.email_check === "valida") score += 10;
        else if (p.email_check === "rischiosa") score -= 15;
    }
    return clamp(score);
}

/**
 * Perché un contatto non va scritto, o null se si può. L'ordine conta: la
 * lista stop vince su tutto, poi chi è già nostro, poi le regole di prudenza.
 * `suppressed` lo dice il database (crm_is_email_suppressed, crm_suppressions).
 */
export function outreachExclusion(
    p: OutreachProspectSignals,
    ctx: { suppressed: boolean; alreadyLead: boolean; alreadyClient: boolean }
): OutreachExclusion | null {
    if (ctx.suppressed) return "lista_stop";
    if (ctx.alreadyClient) return "gia_cliente";
    if (ctx.alreadyLead) return "gia_lead";
    const reachable = (p.email && p.email_check !== "non_valida") || p.phone_e164 || p.instagram;
    if (!reachable) return "non_valida";
    if (isLargeChain(p.locations_count)) return "catena_grande";
    return null;
}

export const OUTREACH_EXCLUSION_LABEL: Record<OutreachExclusion, string> = {
    catena_grande: "Catena grande",
    gia_lead: "Già tra i lead",
    gia_cliente: "Già cliente",
    lista_stop: "Ha chiesto di non essere contattato",
    non_valida: "Nessun recapito valido",
    a_mano: "Escluso a mano"
};
