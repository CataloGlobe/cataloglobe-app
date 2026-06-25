import { describe, it, expect } from "vitest";
import { classifyChange } from "../../supabase/functions/_shared/classifyChange";

// Full 2x3 routing matrix: tierDir (up/same/down) × seatDir (up/same/down).
// "no-op" only at tier same + seats same. The combined sequence is the single
// new cell: tier down + seats up.
describe("classifyChange — routing matrix (9 crossings)", () => {
    it("tier up × seats up → upgrade", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 1, targetPlan: "pro", targetSeats: 3 }))
            .toEqual({ tierDir: "up", seatDir: "up", route: "upgrade" });
    });

    it("tier up × seats same → upgrade", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 2, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "up", seatDir: "same", route: "upgrade" });
    });

    it("tier up × seats down → upgrade (non-optimized crossing, left as-is)", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 3, targetPlan: "pro", targetSeats: 1 }))
            .toEqual({ tierDir: "up", seatDir: "down", route: "upgrade" });
    });

    it("tier same × seats up → upgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 4 }))
            .toEqual({ tierDir: "same", seatDir: "up", route: "upgrade" });
    });

    it("tier same × seats same → no-op", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "same", seatDir: "same", route: "no-op" });
    });

    it("tier same × seats down → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 4, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "same", seatDir: "down", route: "downgrade" });
    });

    it("tier down × seats up → combined-downgrade-seats-up (the FASE 2b bug scenario)", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 1, targetPlan: "base", targetSeats: 4 }))
            .toEqual({ tierDir: "down", seatDir: "up", route: "combined-downgrade-seats-up" });
    });

    it("tier down × seats same → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "base", targetSeats: 2 }))
            .toEqual({ tierDir: "down", seatDir: "same", route: "downgrade" });
    });

    it("tier down × seats down → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 4, targetPlan: "base", targetSeats: 2 }))
            .toEqual({ tierDir: "down", seatDir: "down", route: "downgrade" });
    });
});
