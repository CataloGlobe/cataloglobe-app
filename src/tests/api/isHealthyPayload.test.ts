import { describe, it, expect } from "vitest";
import { isHealthyPayload } from "../../../api/_lib/supabaseEdge";

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { business: { status: "active" }, ...overrides };
}

describe("isHealthyPayload — public_allergens", () => {
    it("vertical con allergeni e lista presente → healthy", () => {
        expect(isHealthyPayload(payload({ vertical_type: "food_beverage", public_allergens: [] }))).toBe(true);
    });

    it("vertical con allergeni senza lista → non va in cache", () => {
        expect(isHealthyPayload(payload({ vertical_type: "food_beverage" }))).toBe(false);
        expect(isHealthyPayload(payload({ vertical_type: "restaurant", public_allergens: null }))).toBe(false);
    });

    it("vertical senza allergeni o assente → la lista non serve", () => {
        expect(isHealthyPayload(payload({ vertical_type: "retail" }))).toBe(true);
        expect(isHealthyPayload(payload({ vertical_type: null }))).toBe(true);
        expect(isHealthyPayload(payload())).toBe(true);
    });

    it("le regole esistenti restano: sede non attiva → non healthy", () => {
        expect(
            isHealthyPayload({ business: { status: "inactive" }, vertical_type: "food_beverage", public_allergens: [] })
        ).toBe(false);
    });
});
