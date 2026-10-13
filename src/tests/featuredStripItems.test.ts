import { describe, expect, it } from "vitest";
import { FEATURED_STRIP_LIMIT, featuredStripItems } from "@/components/PublicCollectionView/redesign/featured/stripItems";
import type { V2FeaturedContent } from "@/types/resolvedCollections";

const blocks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }) as V2FeaturedContent);

describe("featuredStripItems (spec §9, carosello C)", () => {
    it("nessun contenuto: niente", () => {
        expect(featuredStripItems([], 0)).toEqual({ visible: [], moreCount: 0 });
    });

    it("da 1 a 5: tutti, niente «Vedi tutti» anche se l'altro slot ne ha altri", () => {
        for (let n = 1; n <= FEATURED_STRIP_LIMIT; n += 1) {
            const result = featuredStripItems(blocks(n), 9);
            expect(result.visible).toHaveLength(n);
            expect(result.moreCount).toBe(0);
        }
    });

    it("oltre 5: i primi 5 e «Altri N» = contenuti di oggi meno quelli nella striscia", () => {
        const result = featuredStripItems(blocks(8), 8);
        expect(result.visible.map(block => block.id)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
        expect(result.moreCount).toBe(3);
        expect(featuredStripItems(blocks(6), 10).moreCount).toBe(5);
    });

    it("un totale più basso dello slot non dà numeri negativi né sotto lo slot", () => {
        expect(featuredStripItems(blocks(7), 0).moreCount).toBe(2);
    });
});
