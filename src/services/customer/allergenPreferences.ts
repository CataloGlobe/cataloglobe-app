/**
 * Customer-side allergen filter preferences.
 *
 * Scope: per activity_id, sessionStorage tab-scoped (coerente con
 * customerSessionStorage.ts). Cliente che torna a fine pasto chiude
 * la tab e il filtro non persiste oltre la sessione.
 *
 * Chiave: cataloglobe-allergens-${activityId}
 * Payload: number[] di allergen_id (V2SystemAllergen.id, SMALLINT).
 */

const STORAGE_KEY_PREFIX = "cataloglobe-allergens-";

function storageKey(activityId: string): string {
    return `${STORAGE_KEY_PREFIX}${activityId}`;
}

export function getAllergenPreferences(activityId: string): number[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = sessionStorage.getItem(storageKey(activityId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x): x is number => typeof x === "number");
    } catch {
        return [];
    }
}

export function setAllergenPreferences(activityId: string, ids: number[]): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(storageKey(activityId), JSON.stringify(ids));
    } catch {
        /* quota / disabled storage: silent fail */
    }
}

export function clearAllergenPreferences(activityId: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(storageKey(activityId));
    } catch {
        /* noop */
    }
}
