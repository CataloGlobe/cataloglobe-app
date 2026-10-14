import { describe, it, expect } from "vitest";
import { allergenEntries, characteristicEntries } from "@/components/PublicCollectionView/redesign/sheets/menuInfo";
import type {
    CollectionViewSectionGroup,
    CollectionViewSectionItem
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedCharacteristic } from "@/types/resolvedCollections";

const allergen = (id: number, code: string, sort_order: number): Allergen => ({
    id,
    code,
    label_it: `${code}-it`,
    label_en: `${code}-en`,
    sort_order
});

const characteristic = (id: string, sort_order: number): ResolvedCharacteristic => ({
    id,
    code: id,
    category: "diet",
    label: id,
    icon: "leaf",
    sort_order,
    mutex_group: null,
    dietary_claim: false
});

const item = (id: string, extra: Partial<CollectionViewSectionItem> = {}) => ({ id, name: id, ...extra }) as CollectionViewSectionItem;

const groups = (...sections: CollectionViewSectionItem[][]): CollectionViewSectionGroup[] => [
    {
        root: { id: "r", name: "r", items: sections[0] ?? [], level: 1, parentCategoryId: null },
        children: sections.slice(1).map((items, i) => ({ id: `c${i}`, name: "c", items, level: 2, parentCategoryId: "r" }))
    }
];

const glutine = allergen(1, "gluten", 1);
const latte = allergen(2, "milk", 2);
const uova = allergen(3, "eggs", 3);

describe("allergenEntries", () => {
    it("presenti prima (dal più frequente), poi gli assenti nell'ordine di legge", () => {
        const menu = groups([
            item("a", { allergens: [{ id: 2, code: "milk", label: "Latte" }] }),
            item("b", { allergens: [{ id: 2, code: "milk", label: "Latte" }, { id: 3, code: "eggs", label: "Uova" }] })
        ]);
        expect(allergenEntries([glutine, latte, uova], menu, "it").map(e => [e.code, e.count])).toEqual([
            ["milk", 2],
            ["eggs", 1],
            ["gluten", 0]
        ]);
    });

    it("un piatto in due categorie conta una volta", () => {
        const piatto = item("a", { allergens: [{ id: 1, code: "gluten", label: "Glutine" }] });
        expect(allergenEntries([glutine], groups([piatto], [piatto]), "it")[0].count).toBe(1);
    });

    it("nome tradotto dal menu, altrimenti dall'elenco nella lingua", () => {
        const menu = groups([item("a", { allergens: [{ id: 2, code: "milk", label: "Milch" }] })]);
        const entries = allergenEntries([glutine, latte], menu, "de");
        expect(entries.find(e => e.id === 2)?.label).toBe("Milch");
        expect(entries.find(e => e.id === 1)?.label).toBe("gluten-en");
        expect(allergenEntries([glutine], [], "it-IT")[0].label).toBe("gluten-it");
    });
});

describe("characteristicEntries", () => {
    it("ordine dell'elenco, con i piatti che le hanno", () => {
        const vegano = characteristic("vegan", 2);
        const piccante = characteristic("spicy", 1);
        const menu = groups([item("a", { characteristics: [vegano] }), item("b", { characteristics: [vegano, piccante] })]);
        expect(characteristicEntries([vegano, piccante], menu).map(e => [e.id, e.count])).toEqual([
            ["spicy", 1],
            ["vegan", 2]
        ]);
    });
});
