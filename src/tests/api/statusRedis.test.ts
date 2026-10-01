import { describe, expect, it } from "vitest";
import { bucketFromCounts, lastUtcDays } from "../../../api/_lib/statusRedis";

describe("bucketFromCounts", () => {
    it("peggiore del giorno: un solo down rende il giorno down", () => {
        expect(bucketFromCounts("2026-10-01", { up: "700", down: "1" })).toEqual({
            date: "2026-10-01",
            worst: "down",
            checkCount: 701
        });
    });

    it("degraded senza down → degraded", () => {
        expect(bucketFromCounts("2026-10-01", { up: 10, degraded: 2 }).worst).toBe("degraded");
    });

    it("chiave assente (null) → unknown con zero controlli", () => {
        expect(bucketFromCounts("2026-10-01", null)).toEqual({
            date: "2026-10-01",
            worst: "unknown",
            checkCount: 0
        });
    });
});

describe("lastUtcDays", () => {
    it("90 giorni dal più vecchio, l'ultimo è oggi (UTC)", () => {
        const days = lastUtcDays(new Date("2026-10-01T23:30:00Z"), 90);
        expect(days).toHaveLength(90);
        expect(days[89]).toBe("2026-10-01");
        expect(days[0]).toBe("2026-07-04");
    });
});
