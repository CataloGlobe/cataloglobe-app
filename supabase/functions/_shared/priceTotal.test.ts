import { describe, it, expect } from "vitest";
import { priceTotalCents } from "./priceTotal.ts";

describe("priceTotalCents (_shared)", () => {
    it("per_unit: every seat at full price", () => {
        const price = { billing_scheme: "per_unit", unit_amount: 3900 };
        expect(priceTotalCents(price, 1)).toBe(3900);
        expect(priceTotalCents(price, 3)).toBe(11700);
    });

    it("per_unit without unit_amount returns null", () => {
        expect(priceTotalCents({ billing_scheme: "per_unit", unit_amount: null }, 2)).toBeNull();
    });

    it("legacy graduated tiers: second seat discounted", () => {
        const price = {
            billing_scheme: "tiered",
            tiers_mode: "graduated",
            tiers: [
                { up_to: null, unit_amount: 3510, flat_amount: null },
                { up_to: 1, unit_amount: 3900, flat_amount: null }
            ]
        };
        expect(priceTotalCents(price, 1)).toBe(3900);
        expect(priceTotalCents(price, 3)).toBe(3900 + 2 * 3510);
    });

    it("quantity beyond the last tier returns null", () => {
        const price = {
            billing_scheme: "tiered",
            tiers_mode: "graduated",
            tiers: [{ up_to: 2, unit_amount: 3900, flat_amount: null }]
        };
        expect(priceTotalCents(price, 3)).toBeNull();
    });

    it("volume tiers are not supported", () => {
        const price = { billing_scheme: "tiered", tiers_mode: "volume", tiers: [] };
        expect(priceTotalCents(price, 1)).toBeNull();
    });
});
