import { describe, expect, it } from "vitest";
import { daysOfWeekForDb } from "@/utils/scheduleDays";

describe("daysOfWeekForDb — mai [] nella colonna", () => {
    it("nessun giorno scelto diventa null, cioè ogni giorno", () => {
        expect(daysOfWeekForDb([])).toBeNull();
        expect(daysOfWeekForDb(null)).toBeNull();
        expect(daysOfWeekForDb(undefined)).toBeNull();
    });

    it("i giorni scelti restano come sono", () => {
        expect(daysOfWeekForDb([1, 5])).toEqual([1, 5]);
    });
});
