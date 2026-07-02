import { describe, it, expect } from "vitest";
import {
    normalizeName,
    computeProductMatch,
    detectInScanDuplicates,
    findSimilarCategory
} from "@/utils/importMatching";

describe("normalizeName", () => {
    it("lowercases and trims", () => {
        expect(normalizeName("  Pizza Margherita  ")).toBe("pizza margherita");
    });

    it("strips diacritics (à/è/ç)", () => {
        expect(normalizeName("Ragù à la Crème")).toBe("ragu a la creme");
        expect(normalizeName("Provençal")).toBe("provencal");
    });

    it("collapses multiple internal spaces", () => {
        expect(normalizeName("Spaghetti    al   pomodoro")).toBe("spaghetti al pomodoro");
    });
});

describe("computeProductMatch", () => {
    it("returns 'in_category' when name already present in destination category", () => {
        const result = computeProductMatch("Bruschetta", {
            existingInCategory: [{ id: "p1", name: "bruschetta" }],
            existingInTenant: [{ id: "p1", name: "Bruschetta" }]
        });
        expect(result.status).toBe("in_category");
    });

    it("returns 'reusable_single' with productId for one tenant match outside the category", () => {
        const result = computeProductMatch("Tiramisù", {
            existingInCategory: [],
            existingInTenant: [{ id: "p9", name: "Tiramisu" }]
        });
        expect(result).toEqual({ status: "reusable_single", productId: "p9" });
    });

    it("returns 'reusable_ambiguous' with candidates for >=2 tenant matches", () => {
        const result = computeProductMatch("Caffè", {
            existingInCategory: [],
            existingInTenant: [
                { id: "a", name: "Caffe" },
                { id: "b", name: "caffè" },
                { id: "c", name: "Cappuccino" }
            ]
        });
        expect(result.status).toBe("reusable_ambiguous");
        if (result.status === "reusable_ambiguous") {
            expect(result.candidates).toEqual([
                { id: "a", name: "Caffe" },
                { id: "b", name: "caffè" }
            ]);
        }
    });

    it("returns 'none' when no match anywhere", () => {
        const result = computeProductMatch("Polpo alla griglia", {
            existingInCategory: [{ id: "x", name: "Insalata" }],
            existingInTenant: [{ id: "x", name: "Insalata" }]
        });
        expect(result.status).toBe("none");
    });
});

describe("detectInScanDuplicates", () => {
    it("flags groups of products with identical normalized name within the scan", () => {
        const groups = detectInScanDuplicates([
            { id: "1", name: "Coca Cola" },
            { id: "2", name: "coca  cola" },
            { id: "3", name: "Acqua" },
            { id: "4", name: "COCA COLA" }
        ]);
        expect(groups).toEqual([{ normalized: "coca cola", ids: ["1", "2", "4"] }]);
    });

    it("returns empty array when no duplicates", () => {
        expect(
            detectInScanDuplicates([
                { id: "1", name: "Acqua" },
                { id: "2", name: "Vino" }
            ])
        ).toEqual([]);
    });
});

describe("findSimilarCategory", () => {
    it("finds a containing existing category (returns original casing)", () => {
        expect(findSimilarCategory("Primi", ["Primi Piatti", "Dolci"])).toBe("Primi Piatti");
    });

    it("finds when the AI name contains the existing one", () => {
        expect(findSimilarCategory("Secondi Piatti", ["Secondi"])).toBe("Secondi");
    });

    it("is accent/case-insensitive", () => {
        expect(findSimilarCategory("Caffè", ["Caffetteria"])).toBe("Caffetteria");
    });

    it("excludes exact (normalized) equality", () => {
        expect(findSimilarCategory("Antipasti", ["antipasti"])).toBeNull();
    });

    it("returns null when nothing is similar", () => {
        expect(findSimilarCategory("Bevande", ["Antipasti", "Dolci"])).toBeNull();
    });

    it("ignores too-short names (guard against spurious matches)", () => {
        expect(findSimilarCategory("Tè", ["Tè caldi"])).toBeNull();
        expect(findSimilarCategory("Zuppe", ["Tè"])).toBeNull();
    });

    it("returns the first similar match", () => {
        expect(findSimilarCategory("Primi", ["Primi Piatti", "Primi del giorno"])).toBe(
            "Primi Piatti"
        );
    });
});
