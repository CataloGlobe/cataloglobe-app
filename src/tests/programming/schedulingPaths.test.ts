import { describe, it, expect } from "vitest";
import { schedulingPath, schedulingRulePath } from "@/pages/Dashboard/Programming/schedulingPaths";

// Dove porta «Programmazione» da una sede (T9b, PG6-PG7): con più sedi la
// Programmazione della sede, con una sola quella di sempre (nulla cambia).
describe("schedulingPath", () => {
    it("più sedi: la rotta della sede", () => {
        expect(schedulingPath("t1", "a1", false)).toBe("/business/t1/locations/a1/programmazione");
    });
    it("una sede sola, o nessuna sede: la rotta d'azienda", () => {
        expect(schedulingPath("t1", "a1", true)).toBe("/business/t1/scheduling");
        expect(schedulingPath("t1", null, false)).toBe("/business/t1/scheduling");
    });
});

describe("schedulingRulePath", () => {
    it("il dettaglio sotto la stessa base, in evidenza con la sua rotta", () => {
        expect(schedulingRulePath("t1", "a1", false, { id: "r1", rule_type: "layout" })).toBe(
            "/business/t1/locations/a1/programmazione/r1"
        );
        expect(schedulingRulePath("t1", "a1", false, { id: "r2", rule_type: "featured" })).toBe(
            "/business/t1/locations/a1/programmazione/featured/r2"
        );
        expect(schedulingRulePath("t1", "a1", true, { id: "r1", rule_type: "price" })).toBe("/business/t1/scheduling/r1");
    });
});
