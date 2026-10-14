import type { CollectionViewSectionGroup } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedCharacteristic } from "@/types/resolvedCollections";

export type AllergenEntry = { id: number; code: string; label: string; count: number };
export type CharacteristicEntry = { id: string; icon: string; label: string; count: number };

/** Piatti del menu, ognuno una volta sola anche se sta in più categorie. */
function uniqueItems(groups: CollectionViewSectionGroup[]) {
    const seen = new Map<string, CollectionViewSectionGroup["root"]["items"][number]>();
    for (const group of groups) {
        for (const section of [group.root, ...group.children]) {
            for (const item of section.items) if (!seen.has(item.id)) seen.set(item.id, item);
        }
    }
    return [...seen.values()];
}

/**
 * Gli allergeni di legge con quanti piatti del menu li contengono: prima i
 * presenti (dal più frequente), poi gli assenti nell'ordine di sempre. Il nome
 * è quello tradotto del menu quando c'è, altrimenti quello dell'elenco.
 */
export function allergenEntries(allergens: Allergen[], groups: CollectionViewSectionGroup[], lang: string): AllergenEntry[] {
    const counts = new Map<number, number>();
    const labels = new Map<number, string>();
    for (const item of uniqueItems(groups)) {
        for (const allergen of item.allergens ?? []) {
            counts.set(allergen.id, (counts.get(allergen.id) ?? 0) + 1);
            if (allergen.label) labels.set(allergen.id, allergen.label);
        }
    }
    return [...allergens]
        .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sort_order - b.sort_order)
        .map(a => ({
            id: a.id,
            code: a.code,
            label: labels.get(a.id) ?? (lang.startsWith("it") ? a.label_it : a.label_en),
            count: counts.get(a.id) ?? 0
        }));
}

/** Le caratteristiche del menu con quanti piatti le hanno, nell'ordine dell'elenco. */
export function characteristicEntries(
    characteristics: ResolvedCharacteristic[],
    groups: CollectionViewSectionGroup[]
): CharacteristicEntry[] {
    const counts = new Map<string, number>();
    for (const item of uniqueItems(groups)) {
        for (const characteristic of item.characteristics ?? []) {
            counts.set(characteristic.id, (counts.get(characteristic.id) ?? 0) + 1);
        }
    }
    return [...characteristics]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(c => ({ id: c.id, icon: c.icon, label: c.label, count: counts.get(c.id) ?? 0 }));
}
