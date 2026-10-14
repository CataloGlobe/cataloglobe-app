import { describe, expect, it } from "vitest";
import {
    countHits,
    highlightParts,
    searchSections
} from "@/components/PublicCollectionView/redesign/search/searchMatch";
import { withRecentSearch } from "@/components/PublicCollectionView/redesign/search/recentSearches";
import type { CollectionViewSection } from "@/components/PublicCollectionView/CollectionView/CollectionView";

const item = (id: string, name: string, description?: string) => ({ id, name, description }) as never;
const section = (id: string, items: unknown[]) =>
    ({ id, name: id, items, level: 1, parentCategoryId: null }) as unknown as CollectionViewSection;

describe("searchSections (spec §4)", () => {
    const sections = [
        section("Primi", [item("a", "Pasta al pomodoro"), item("b", "Pomodori secchi"), item("c", "Risotto", "con pomodoro")]),
        section("Pizze", [item("d", "Pomodoro e basilico"), item("a", "Pasta al pomodoro")])
    ];

    it("per sezione nell'ordine del menu, dentro per punteggio, senza doppioni", () => {
        const groups = searchSections(sections, "Pomodoro");
        expect(groups.map(g => g.section.id)).toEqual(["Primi", "Pizze"]);
        expect(groups[0].hits.map(h => h.item.id)).toEqual(["a", "c"]);
        expect(groups[1].hits.map(h => h.item.id)).toEqual(["d"]);
        expect(countHits(groups)).toBe(3);
    });

    it("accenti e maiuscole non contano; campo vuoto = niente risultati", () => {
        expect(countHits(searchSections([section("S", [item("x", "Caffè")])], "CAFFE"))).toBe(1);
        expect(searchSections(sections, "   ")).toEqual([]);
    });
});

describe("highlightParts", () => {
    it("segna i tratti trovati sul testo originale, accenti compresi", () => {
        expect(highlightParts("Caffè e caffellatte", "caffe")).toEqual([
            { text: "Caffè", match: true },
            { text: " e ", match: false },
            { text: "caffe", match: true },
            { text: "llatte", match: false }
        ]);
    });

    it("senza ricerca il testo resta intero", () => {
        expect(highlightParts("Tiramisù", "")).toEqual([{ text: "Tiramisù", match: false }]);
    });
});

describe("withRecentSearch", () => {
    it("la nuova in cima, niente doppioni, al massimo 5", () => {
        expect(withRecentSearch(["pizza", "birra"], " Birra ")).toEqual(["Birra", "pizza"]);
        expect(withRecentSearch(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
        expect(withRecentSearch(["a"], "  ")).toEqual(["a"]);
    });
});
