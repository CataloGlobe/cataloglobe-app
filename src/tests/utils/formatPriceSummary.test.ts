import { describe, it, expect } from "vitest";
import { formatPriceSummary } from "@/utils/formatPriceSummary";
import { resolvePriceSummary } from "@/utils/priceSummary";

describe("formatPriceSummary", () => {
    it("returns null when there is no price", () => {
        expect(formatPriceSummary(resolvePriceSummary([]))).toBeNull();
    });

    it("formats a single price without a 'da' prefix", () => {
        expect(formatPriceSummary(resolvePriceSummary([10]))).toBe("€10.00");
    });

    it("formats multiple prices with the 'da' prefix on the minimum", () => {
        expect(formatPriceSummary(resolvePriceSummary([90, 10]))).toBe("da €10.00");
    });

    it("respects a custom currency symbol", () => {
        expect(
            formatPriceSummary(resolvePriceSummary([10]), { currencySymbol: "$" })
        ).toBe("$10.00");
        expect(
            formatPriceSummary(resolvePriceSummary([90, 10]), { currencySymbol: "$" })
        ).toBe("da $10.00");
    });

    it("accepts a context option without changing today's output (reserved for future use)", () => {
        expect(
            formatPriceSummary(resolvePriceSummary([90, 10]), { context: "backoffice" })
        ).toBe("da €10.00");
    });
});
