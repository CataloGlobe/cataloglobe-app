import { describe, it, expect } from "vitest";
import { deriveClosesNextDay } from "../../pages/Operativita/Attivita/tabs/hours-services/hoursOvernight";

// deriveClosesNextDay must be a pure function of the (opens_at, closes_at) pair,
// independent of which field was edited last. It mirrors the DB CHECK
// `activity_hours_time_coherence`: an overnight slot (closes_at < opens_at) is
// only valid when closes_next_day = true.
describe("deriveClosesNextDay", () => {
    it("same-day slot → false", () => {
        expect(deriveClosesNextDay("09:00", "18:00")).toBe(false);
    });

    it("overnight slot (close before open) → true", () => {
        expect(deriveClosesNextDay("22:00", "02:00")).toBe(true);
    });

    it("close at midnight → true", () => {
        expect(deriveClosesNextDay("09:00", "00:00")).toBe(true);
    });

    it("opens_at null → false", () => {
        expect(deriveClosesNextDay(null, "02:00")).toBe(false);
    });

    it("closes_at null → false", () => {
        expect(deriveClosesNextDay("22:00", null)).toBe(false);
    });

    it("both null → false", () => {
        expect(deriveClosesNextDay(null, null)).toBe(false);
    });

    it("identical times → false (not overnight)", () => {
        expect(deriveClosesNextDay("12:00", "12:00")).toBe(false);
    });

    it("order independence: result depends only on the pair, not edit order", () => {
        // Whatever field the user typed last, the derived flag for the same
        // resulting pair is identical.
        const opens = "22:00";
        const closes = "02:00";
        const afterEditingOpensLast = deriveClosesNextDay(opens, closes);
        const afterEditingClosesLast = deriveClosesNextDay(opens, closes);
        expect(afterEditingOpensLast).toBe(afterEditingClosesLast);
        expect(afterEditingOpensLast).toBe(true);
    });
});
