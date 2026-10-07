import { describe, it, expect } from "vitest";

import {
    calculateDelta,
    calculatePointDelta,
    DEFAULT_PERIOD,
    isBelowSample,
    parsePeriod,
    periodToDateRange
} from "@/pages/Dashboard/Analytics/utils/periodComparison";

/** Periodo, soglia del campione e base minima del confronto (§36.1/3, A3). */

describe("parsePeriod", () => {
    it("i cinque periodi, il resto torna ai 30 giorni", () => {
        expect(parsePeriod("7d")).toBe("7d");
        expect(parsePeriod("today")).toBe("today");
        expect(parsePeriod(null)).toBe(DEFAULT_PERIOD);
        expect(parsePeriod("boh")).toBe("30d");
    });
});

describe("periodToDateRange", () => {
    it("«Oggi» parte dalla mezzanotte di Roma, estate (+2)", () => {
        const now = new Date("2026-09-23T10:00:00Z"); // 12:00 a Roma
        expect(periodToDateRange("today", now).from.toISOString()).toBe("2026-09-22T22:00:00.000Z");
    });

    it("«Oggi» parte dalla mezzanotte di Roma, inverno (+1), anche col browser altrove", () => {
        const now = new Date("2026-12-10T23:30:00Z"); // 00:30 dell'11 a Roma
        expect(periodToDateRange("today", now).from.toISOString()).toBe("2026-12-10T23:00:00.000Z");
    });

    it("30 giorni fino ad adesso", () => {
        const now = new Date("2026-09-23T10:00:00Z");
        const { from, to } = periodToDateRange("30d", now);
        expect(to.toISOString()).toBe(now.toISOString());
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(30);
    });
});

describe("soglia e confronto", () => {
    it("sotto 100 visite il campione è piccolo", () => {
        expect(isBelowSample(99)).toBe(true);
        expect(isBelowSample(100)).toBe(false);
    });

    it("il confronto chiede una base minima", () => {
        expect(calculateDelta(12, 3)).toBeNull();
        expect(calculateDelta(12, 0)).toBeNull();
        expect(calculateDelta(15, 10)).toBe(50);
        expect(calculateDelta(15, 3, 1)).toBe(400);
    });
});

describe("confronto di un tasso, in punti", () => {
    it("differenza in punti percentuali, senza soglia", () => {
        // 8% contro 5%: +3 pt, non «+60%»; con pochi ordini conta lo stesso.
        expect(calculatePointDelta(8, 5, 3)).toBe(3);
        expect(calculatePointDelta(2.5, 4, 1)).toBeCloseTo(-1.5);
        expect(calculatePointDelta(0, 0, 12)).toBe(0);
    });

    it("niente confronto se il periodo prima non ha nessun ordine", () => {
        expect(calculatePointDelta(10, 0, 0)).toBeNull();
    });
});
