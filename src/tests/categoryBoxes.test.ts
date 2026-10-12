import { describe, expect, it } from "vitest";
import { categoryBoxes, categoryTotals } from "@/components/PublicCollectionView/redesign/categories/categoryBoxes";
import type { CollectionViewSection, CollectionViewSectionGroup } from "@/components/PublicCollectionView/CollectionView/CollectionView";

const section = (id: string, items: number, level = 1, parent: string | null = null) =>
    ({ id, name: id, items: Array.from({ length: items }, () => ({})), level, parentCategoryId: parent }) as unknown as CollectionViewSection;

describe("categoryBoxes (spec §4, D36)", () => {
    it("principale senza sottocategorie: una riga col conteggio", () => {
        const groups: CollectionViewSectionGroup[] = [{ root: section("antipasti", 3), children: [] }];
        expect(categoryBoxes(groups)).toEqual([{ id: "antipasti", rows: [{ id: "antipasti", name: "antipasti", depth: 0, count: 3 }] }]);
    });

    it("principale con sottocategorie: testata senza conteggio, figlie col loro (nipoti compresi)", () => {
        const groups: CollectionViewSectionGroup[] = [
            {
                root: section("bere", 0),
                children: [section("vini", 1, 2, "bere"), section("rossi", 4, 3, "vini"), section("birre", 2, 2, "bere")]
            }
        ];
        expect(categoryBoxes(groups)[0].rows).toEqual([
            { id: "bere", name: "bere", depth: 0, count: null },
            { id: "vini", name: "vini", depth: 1, count: 5 },
            { id: "rossi", name: "rossi", depth: 2, count: 4 },
            { id: "birre", name: "birre", depth: 1, count: 2 }
        ]);
    });

    it("senza piatti (filtri): via la riga e, se vuoto, il riquadro", () => {
        const groups: CollectionViewSectionGroup[] = [
            { root: section("dolci", 0), children: [] },
            { root: section("primi", 0), children: [section("pasta", 0, 2, "primi"), section("risotti", 2, 2, "primi")] }
        ];
        const boxes = categoryBoxes(groups);
        expect(boxes.map(box => box.id)).toEqual(["primi"]);
        expect(boxes[0].rows.map(row => row.id)).toEqual(["primi", "risotti"]);
    });

    it("totali del sottotitolo: categorie principali con piatti e piatti visibili", () => {
        const groups: CollectionViewSectionGroup[] = [
            { root: section("dolci", 0), children: [] },
            { root: section("antipasti", 3), children: [] },
            { root: section("primi", 1), children: [section("pasta", 2, 2, "primi"), section("risotti", 4, 2, "primi")] }
        ];
        expect(categoryTotals(groups)).toEqual({ categories: 2, dishes: 10 });
    });
});
