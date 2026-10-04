import { describe, expect, it } from "vitest";
import { formatMinutes, romeMidnight, stageCount, summaryDelta, summaryRange } from "@/utils/crm/summary";

describe("periodi in ora di Roma", () => {
    it("mezzanotte di Roma, legale e solare", () => {
        expect(romeMidnight(2026, 10, 4).toISOString()).toBe("2026-10-03T22:00:00.000Z");
        expect(romeMidnight(2026, 12, 4).toISOString()).toBe("2026-12-03T23:00:00.000Z");
        expect(romeMidnight(2026, 10, 25).toISOString()).toBe("2026-10-24T22:00:00.000Z");
        expect(romeMidnight(2026, 10, 26).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    });

    it("oggi: dalla mezzanotte, confronto con ieri alla stessa ora", () => {
        const now = new Date("2026-10-04T08:00:00Z"); // 10:00 Roma
        const r = summaryRange("today", now);
        expect(r.from.toISOString()).toBe("2026-10-03T22:00:00.000Z");
        expect(r.previousFrom.toISOString()).toBe("2026-10-02T22:00:00.000Z");
        expect(r.previousTo.toISOString()).toBe("2026-10-03T08:00:00.000Z");
    });

    it("oggi, il primo del mese", () => {
        const r = summaryRange("today", new Date("2026-11-01T09:00:00Z"));
        expect(r.from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
        expect(r.previousFrom.toISOString()).toBe("2026-10-30T23:00:00.000Z");
    });

    it("mese: dal primo, confronto allo stesso punto del mese prima", () => {
        const now = new Date("2026-10-04T08:00:00Z");
        const r = summaryRange("month", now);
        expect(r.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
        expect(r.previousFrom.toISOString()).toBe("2026-08-31T22:00:00.000Z");
        const jan = summaryRange("month", new Date("2027-01-10T08:00:00Z"));
        expect(jan.previousFrom.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    });

    it("7 e 30 giorni a scorrere", () => {
        const now = new Date("2026-10-04T08:00:00Z");
        const r = summaryRange("7d", now);
        expect(r.from.toISOString()).toBe("2026-09-27T08:00:00.000Z");
        expect(r.previousTo).toEqual(r.from);
        expect(summaryRange("30d", now).compareLabel).toBe("vs i 30 giorni prima");
    });
});

describe("numeri", () => {
    it("variazione solo con una base sufficiente", () => {
        expect(summaryDelta(12, 10)).toBe(20);
        expect(summaryDelta(3, 4)).toBeNull();
        expect(summaryDelta(0, 5)).toBe(-100);
    });

    it("fasi e minuti", () => {
        expect(stageCount({ stages: { contattato: 3 } } as never, "contattato")).toBe(3);
        expect(stageCount(null, "contattato")).toBe(0);
        expect(formatMinutes(45)).toBe("45 min");
        expect(formatMinutes(190)).toBe("3 h 10 min");
        expect(formatMinutes(120)).toBe("2 h");
        expect(formatMinutes(3120)).toBe("2 g 4 h");
        expect(formatMinutes(null)).toBe("—");
    });
});
