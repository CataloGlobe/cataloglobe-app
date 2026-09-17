import { describe, it, expect } from "vitest";
import { classifyChange } from "../../supabase/functions/_shared/classifyChange";

// Full 3x3 routing matrix: tierDir (up/same/down) × seatDir (up/same/down).
// "no-op" only at tier same + seats same. The combined sequence is the single
// new cell: tier down + seats up.
describe("classifyChange — routing matrix (9 crossings)", () => {
    it("tier up × seats up → upgrade", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 1, targetPlan: "pro", targetSeats: 3 }))
            .toEqual({ tierDir: "up", seatDir: "up", intervalDir: "same", route: "upgrade" });
    });

    it("tier up × seats same → upgrade", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 2, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "up", seatDir: "same", intervalDir: "same", route: "upgrade" });
    });

    it("tier up × seats down → upgrade (non-optimized crossing, left as-is)", () => {
        expect(classifyChange({ currentPlan: "base", currentSeats: 3, targetPlan: "pro", targetSeats: 1 }))
            .toEqual({ tierDir: "up", seatDir: "down", intervalDir: "same", route: "upgrade" });
    });

    it("tier same × seats up → upgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 4 }))
            .toEqual({ tierDir: "same", seatDir: "up", intervalDir: "same", route: "upgrade" });
    });

    it("tier same × seats same → no-op", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "same", seatDir: "same", intervalDir: "same", route: "no-op" });
    });

    it("tier same × seats down → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 4, targetPlan: "pro", targetSeats: 2 }))
            .toEqual({ tierDir: "same", seatDir: "down", intervalDir: "same", route: "downgrade" });
    });

    it("tier down × seats up → combined-downgrade-seats-up (the FASE 2b bug scenario)", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 1, targetPlan: "base", targetSeats: 4 }))
            .toEqual({ tierDir: "down", seatDir: "up", intervalDir: "same", route: "combined-downgrade-seats-up" });
    });

    it("tier down × seats same → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "base", targetSeats: 2 }))
            .toEqual({ tierDir: "down", seatDir: "same", intervalDir: "same", route: "downgrade" });
    });

    it("tier down × seats down → downgrade", () => {
        expect(classifyChange({ currentPlan: "pro", currentSeats: 4, targetPlan: "base", targetSeats: 2 }))
            .toEqual({ tierDir: "down", seatDir: "down", intervalDir: "same", route: "downgrade" });
    });
});

// Third axis (billing interval). Absent or equal intervals must leave the
// matrix above untouched; a moving interval routes to its own dedicated
// branches and never rides along with a tier/seat change.
describe("classifyChange — billing interval axis", () => {
    it("intervals equal → identical to the two-axis result", () => {
        const twoAxis = classifyChange({ currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 4 });
        const threeAxis = classifyChange({
            currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 4,
            currentInterval: "month", targetInterval: "month"
        });
        expect(threeAxis).toEqual(twoAxis);
    });

    it("target interval omitted with a known current → axis does not move", () => {
        expect(classifyChange({
            currentPlan: "pro", currentSeats: 2, targetPlan: "base", targetSeats: 2, currentInterval: "month"
        })).toEqual({ tierDir: "down", seatDir: "same", intervalDir: "same", route: "downgrade" });
    });

    it("current interval unknown (null) → axis does not move even with a target", () => {
        expect(classifyChange({
            currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 2,
            currentInterval: null, targetInterval: "year"
        })).toEqual({ tierDir: "same", seatDir: "same", intervalDir: "same", route: "no-op" });
    });

    it("month → year alone → interval-up", () => {
        expect(classifyChange({
            currentPlan: "pro", currentSeats: 2, targetPlan: "pro", targetSeats: 2,
            currentInterval: "month", targetInterval: "year"
        })).toEqual({ tierDir: "same", seatDir: "same", intervalDir: "up", route: "interval-up" });
    });

    it("year → month alone → interval-down", () => {
        expect(classifyChange({
            currentPlan: "base", currentSeats: 1, targetPlan: "base", targetSeats: 1,
            currentInterval: "year", targetInterval: "month"
        })).toEqual({ tierDir: "same", seatDir: "same", intervalDir: "down", route: "interval-down" });
    });

    it("month → year with a tier change → interval-mixed (never upgrade)", () => {
        expect(classifyChange({
            currentPlan: "base", currentSeats: 1, targetPlan: "pro", targetSeats: 1,
            currentInterval: "month", targetInterval: "year"
        })).toEqual({ tierDir: "up", seatDir: "same", intervalDir: "up", route: "interval-mixed" });
    });

    it("month → year with a seat change → interval-mixed (never upgrade)", () => {
        expect(classifyChange({
            currentPlan: "pro", currentSeats: 1, targetPlan: "pro", targetSeats: 3,
            currentInterval: "month", targetInterval: "year"
        })).toEqual({ tierDir: "same", seatDir: "up", intervalDir: "up", route: "interval-mixed" });
    });

    it("year → month with tier down → interval-mixed (never downgrade/combined)", () => {
        expect(classifyChange({
            currentPlan: "pro", currentSeats: 1, targetPlan: "base", targetSeats: 3,
            currentInterval: "year", targetInterval: "month"
        })).toEqual({ tierDir: "down", seatDir: "up", intervalDir: "down", route: "interval-mixed" });
    });
});
