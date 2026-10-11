/**
 * Ricerche recenti (spec §4): solo comodità di chi guarda, nel suo browser,
 * per sede. Lo storage può mancare o lanciare (navigazione privata): allora
 * niente recenti, la ricerca funziona uguale.
 */
const MAX_RECENT = 5;
const keyFor = (activityId: string) => `pub-recent-searches:${activityId}`;

export function readRecentSearches(activityId: string | undefined): string[] {
    if (!activityId) return [];
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(keyFor(activityId)) ?? "[]");
        return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

/** La nuova in cima; la stessa ricerca (senza maiuscole né spazi) una volta sola. */
export function withRecentSearch(list: readonly string[], query: string): string[] {
    const clean = query.trim();
    if (!clean) return [...list];
    const same = (v: string) => v.trim().toLowerCase() === clean.toLowerCase();
    return [clean, ...list.filter(v => !same(v))].slice(0, MAX_RECENT);
}

export function saveRecentSearch(activityId: string | undefined, query: string): void {
    if (!activityId) return;
    try {
        const next = withRecentSearch(readRecentSearches(activityId), query);
        window.localStorage.setItem(keyFor(activityId), JSON.stringify(next));
    } catch {
        // storage assente o pieno: i recenti sono solo una comodità
    }
}
