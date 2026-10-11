import { useSyncExternalStore } from "react";
import type { ResolvedCharacteristic } from "@/types/resolvedCollections";
import type { CollectionViewSectionGroup } from "@/components/PublicCollectionView/CollectionView/CollectionView";

/**
 * Preferenze dei Filtri (spec §4): Vegetariano, Vegano, Piccante ricavate
 * dalle caratteristiche di sistema che il locale mette sui piatti, senza dati
 * nuovi (D60). «Senza glutine» non sta qui: è lo stesso filtro dell'allergene
 * Glutine, e la pagina dei Filtri lo accende insieme.
 *
 * Al contrario degli allergeni (in esclusione) una preferenza tiene solo i
 * piatti che la portano; più preferenze valgono insieme. Durano la visita
 * della sede (memoria della pagina, anche tornando da un'altra rotta), non si
 * salvano: sono una scelta del momento.
 */
export type PreferenceKey = "vegetarian" | "vegan" | "spicy";

export const PREFERENCE_KEYS: readonly PreferenceKey[] = ["vegetarian", "vegan", "spicy"];

/** Icone delle caratteristiche di sistema corrispondenti (`product_characteristics.icon`). */
export const PREFERENCE_ICON: Record<PreferenceKey, string> = {
    vegetarian: "custom:leaf",
    vegan: "custom:sprout",
    spicy: "custom:pepper-1"
};

/** Icona di «Senza glutine» (caratteristica `gluten_free`). */
export const GLUTEN_FREE_ICON = "custom:wheat-off";

type WithCharacteristics = { characteristics?: Pick<ResolvedCharacteristic, "code" | "category">[] };

function hasPreference(characteristics: Pick<ResolvedCharacteristic, "code" | "category">[], key: PreferenceKey): boolean {
    switch (key) {
        // Un piatto vegano è anche vegetariano.
        case "vegetarian":
            return characteristics.some(c => c.code === "vegetarian" || c.code === "vegan");
        case "vegan":
            return characteristics.some(c => c.code === "vegan");
        case "spicy":
            return characteristics.some(c => c.category === "spicy");
    }
}

/** Il piatto porta tutte le preferenze scelte (nessuna scelta: sempre sì). */
export function matchesPreferences(item: WithCharacteristics, keys: readonly PreferenceKey[]): boolean {
    if (keys.length === 0) return true;
    const characteristics = item.characteristics ?? [];
    return keys.every(key => hasPreference(characteristics, key));
}

/**
 * Le preferenze che hanno almeno un piatto nel menu: le altre svuoterebbero il
 * menu e non si mostrano (come gli allergeni assenti). Si guarda il piatto,
 * come fa il filtro: una variante vegana sola non basta.
 */
export function availablePreferences(items: readonly WithCharacteristics[]): PreferenceKey[] {
    return PREFERENCE_KEYS.filter(key => items.some(item => hasPreference(item.characteristics ?? [], key)));
}

/** Le preferenze con piatti nel menu intero (senza i filtri del cliente). */
export function menuPreferences(groups: readonly CollectionViewSectionGroup[]): PreferenceKey[] {
    return availablePreferences(groups.flatMap(g => [...g.root.items, ...g.children.flatMap(c => c.items)]));
}

// ── Stato della visita ──────────────────────────────────────────────────────

const EMPTY: readonly PreferenceKey[] = [];
let selected: readonly PreferenceKey[] = EMPTY;
const listeners = new Set<() => void>();

function emit(next: readonly PreferenceKey[]) {
    selected = next;
    listeners.forEach(listener => listener());
}

export function getPreferences(): readonly PreferenceKey[] {
    return selected;
}

export function togglePreference(key: PreferenceKey) {
    // Ordine fisso, così lo stesso insieme è sempre lo stesso array.
    const has = selected.includes(key);
    emit(PREFERENCE_KEYS.filter(k => (k === key ? !has : selected.includes(k))));
}

export function clearPreferences() {
    if (selected.length > 0) emit(EMPTY);
}

let selectedFor: string | undefined;

/** Valgono per la sede in cui sono state scelte: a un'altra sede ripartono vuote. */
export function keepPreferencesFor(activityId: string | undefined) {
    if (activityId === selectedFor) return;
    selectedFor = activityId;
    clearPreferences();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getServerPreferences = () => EMPTY;

export function usePreferences(): readonly PreferenceKey[] {
    return useSyncExternalStore(subscribe, getPreferences, getServerPreferences);
}
