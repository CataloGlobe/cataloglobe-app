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

/**
 * Chiusura della riga «N piatti nascosti dai filtri».
 *
 * Chiave SORELLA di quella delle preferenze, non la stessa: il payload lì è
 * `number[]` e `getAllergenPreferences` filtra su `typeof x === "number"`,
 * quindi un booleano nello stesso valore verrebbe scartato in silenzio.
 * Stesso scope (per-activity, sessionStorage), stessa famiglia di chiave.
 *
 * Il flag viene rimosso quando i filtri tornano a zero: riapplicandone uno la
 * riga ricompare, perché è un avviso nuovo su uno stato nuovo.
 */
const NOTICE_KEY_PREFIX = "cataloglobe-allergens-notice-";

function noticeKey(activityId: string): string {
    return `${NOTICE_KEY_PREFIX}${activityId}`;
}

export function isHiddenNoticeDismissed(activityId: string): boolean {
    if (typeof window === "undefined") return false;
    try {
        return sessionStorage.getItem(noticeKey(activityId)) === "1";
    } catch {
        return false;
    }
}

export function setHiddenNoticeDismissed(activityId: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(noticeKey(activityId), "1");
    } catch {
        /* quota / disabled storage: silent fail */
    }
}

export function clearHiddenNoticeDismissed(activityId: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(noticeKey(activityId));
    } catch {
        /* noop */
    }
}
