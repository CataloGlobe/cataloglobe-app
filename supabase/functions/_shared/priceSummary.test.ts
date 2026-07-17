import { describe, it, expect } from "vitest";
import { resolvePriceSummary } from "./priceSummary.ts";

describe("resolvePriceSummary (_shared)", () => {
    it("returns kind 'none' for an empty list", () => {
        expect(resolvePriceSummary([])).toEqual({
            kind: "none",
            min: null,
            max: null,
            count: 0
        });
    });

    it("returns kind 'single' for one valid price", () => {
        expect(resolvePriceSummary([10])).toEqual({
            kind: "single",
            min: 10,
            max: 10,
            count: 1
        });
    });

    it("returns kind 'multi' with min/max for several valid prices, ignoring null/undefined", () => {
        expect(resolvePriceSummary([90, null, 10, undefined, 45])).toEqual({
            kind: "multi",
            min: 10,
            max: 90,
            count: 3
        });
    });
});
