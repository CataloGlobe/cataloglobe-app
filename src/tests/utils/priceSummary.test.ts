import { describe, it, expect } from "vitest";
import { resolvePriceSummary } from "@/utils/priceSummary";

describe("resolvePriceSummary", () => {
    it("returns kind 'none' for an empty list", () => {
        const summary = resolvePriceSummary([]);
        expect(summary).toEqual({ kind: "none", min: null, max: null, count: 0 });
    });

    it("returns kind 'none' when every entry is null or undefined", () => {
        const summary = resolvePriceSummary([null, undefined]);
        expect(summary).toEqual({ kind: "none", min: null, max: null, count: 0 });
    });

    it("returns kind 'single' for one valid price", () => {
        const summary = resolvePriceSummary([10]);
        expect(summary).toEqual({ kind: "single", min: 10, max: 10, count: 1 });
    });

    it("returns kind 'multi' with min/max for several valid prices", () => {
        const summary = resolvePriceSummary([90, 10, 45]);
        expect(summary).toEqual({ kind: "multi", min: 10, max: 90, count: 3 });
    });

    it("ignores null/undefined entries mixed with valid prices (count reflects only valid ones)", () => {
        const summary = resolvePriceSummary([10, null, 90, undefined]);
        expect(summary).toEqual({ kind: "multi", min: 10, max: 90, count: 2 });
    });

    it("treats two equal prices as 'multi' (count, not distinctness, decides the kind)", () => {
        const summary = resolvePriceSummary([10, 10]);
        expect(summary).toEqual({ kind: "multi", min: 10, max: 10, count: 2 });
    });

    // Regressione mirata sul bug #8 (getProductListMetadata): contava
    // formatsCount su TUTTI i valori del gruppo, non solo quelli prezzati.
    // Un gruppo con 2 valori di cui 1 senza prezzo deve restare "single",
    // non "multi" — altrimenti backoffice e pubblico divergono.
    it("counts only priced values, not the raw value count (bug #8 regression)", () => {
        const summary = resolvePriceSummary([10, null]);
        expect(summary).toEqual({ kind: "single", min: 10, max: 10, count: 1 });
    });
});
