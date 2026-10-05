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
