/**
 * Cerca ⌘K del CRM: i locali per nome, città o nome del referente, senza
 * maiuscole né accenti. Puro, provato in `src/tests/crmSearch.test.ts`.
 */
import type { CrmVenueListItem } from "@/types/crm";

export function foldText(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function searchVenues(venues: CrmVenueListItem[], query: string, limit = 8): CrmVenueListItem[] {
    const q = foldText(query);
    if (!q) return [];
    const scored: { venue: CrmVenueListItem; rank: number }[] = [];
    for (const venue of venues) {
        const name = foldText(venue.name);
        const rank = name.startsWith(q)
            ? 0
            : name.includes(q)
              ? 1
              : foldText(venue.city ?? "").includes(q) || venue.crm_contacts.some(c => foldText(c.name ?? "").includes(q))
                ? 2
                : -1;
        if (rank >= 0) scored.push({ venue, rank });
    }
    return scored
        .sort((a, b) => a.rank - b.rank || b.venue.last_activity_at.localeCompare(a.venue.last_activity_at))
        .slice(0, limit)
        .map(s => s.venue);
}

// ── Cerca C4 (canvas «Cerca, Gea, Agenti e Costi», 2026-10-05) ─────────────

export type CrmSearchScope = "tutto" | "miei" | "aspettano";

export const CRM_SEARCH_SCOPES: { value: CrmSearchScope; label: string }[] = [
    { value: "tutto", label: "Tutto" },
    { value: "miei", label: "Seguiti da me" },
    { value: "aspettano", label: "Aspettano risposta" }
];

const CLOSED_STAGES = new Set(["cliente_pagante", "perso"]);

/**
 * I lead del riquadro. Col campo vuoto: in «Tutto» gli ultimi tre aperti
 * mossi, negli altri filtri tutti quelli del filtro (fino a `limit`). Col
 * testo: la ricerca per nome, città o referente, poi il filtro.
 * `waiting` = i locali che aspettano voi (`venueWaits`).
 */
export function searchLeads(
    venues: CrmVenueListItem[],
    input: { query: string; scope: CrmSearchScope; userId: string | null; waiting: ReadonlySet<string> },
    limit = 8
): CrmVenueListItem[] {
    const inScope = (v: CrmVenueListItem) =>
        input.scope === "miei"
            ? input.userId !== null && v.assigned_to === input.userId
            : input.scope === "aspettano"
              ? input.waiting.has(v.id)
              : true;
    if (foldText(input.query)) return searchVenues(venues, input.query, venues.length).filter(inScope).slice(0, limit);
    const recent = venues
        .filter(v => !CLOSED_STAGES.has(v.stage) && inScope(v))
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
    return recent.slice(0, input.scope === "tutto" ? 3 : limit);
}

export type CrmSearchActionId = "aggiungi" | "agenda" | "riepilogo" | "pausa" | "bozze";

export interface CrmSearchAction {
    id: CrmSearchActionId;
    label: string;
    to: string;
}

export const CRM_SEARCH_ACTIONS: CrmSearchAction[] = [
    { id: "aggiungi", label: "Aggiungi un lead", to: "/admin/lead?aggiungi=1" },
    { id: "agenda", label: "Vai all'Agenda", to: "/admin/agenda" },
    { id: "riepilogo", label: "Apri il Riepilogo", to: "/admin/lead?vista=riepilogo" },
    { id: "pausa", label: "Metti in pausa gli agenti", to: "/admin/agenti?pausa=1" },
    { id: "bozze", label: "Bozze che aspettano te", to: "/admin" }
];

/** Le azioni veloci: solo in «Tutto»; vuoto le prime tre, col testo quelle che lo contengono. */
export function searchActions(query: string, scope: CrmSearchScope): CrmSearchAction[] {
    if (scope !== "tutto") return [];
    const q = foldText(query);
    if (!q) return CRM_SEARCH_ACTIONS.slice(0, 3);
    return CRM_SEARCH_ACTIONS.filter(a => foldText(a.label).includes(q));
}
