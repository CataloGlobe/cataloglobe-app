import { describe, it, expect } from "vitest";

import { fillDaily, fillHourly, formatHour } from "@/pages/Dashboard/Analytics/utils/analyticsSeries";

/** Le serie di Analitiche riempite per TrendChart. */

const range = { from: new Date("2026-09-20T10:00:00Z"), to: new Date("2026-09-23T10:00:00Z") };

describe("fillDaily", () => {
    it("finestra fissa: tutti i giorni del periodo, zero dove non c'è niente", () => {
        const out = fillDaily([{ date: "2026-09-21", value: 4 }], range, "7d");
        expect(out.map(p => p.date)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]);
        expect(out.map(p => p.value)).toEqual([0, 4, 0, 0]);
    });

    it("«Tutto»: dal primo all'ultimo giorno con dati", () => {
        const out = fillDaily(
            [
                { date: "2026-01-03", value: 1 },
                { date: "2026-01-01", value: 2 }
            ],
            range,
            "all"
        );
        expect(out).toEqual([
            { date: "2026-01-01", value: 2 },
            { date: "2026-01-02", value: 0 },
            { date: "2026-01-03", value: 1 }
        ]);
    });

    it("nessun dato, nessuna serie (il grafico dice il vuoto)", () => {
        expect(fillDaily([], range, "30d")).toEqual([]);
    });
});

describe("fillHourly", () => {
    it("le 24 ore", () => {
        const out = fillHourly([{ hour: 13, value: 7 }]);
        expect(out).toHaveLength(24);
        expect(out[13]).toEqual({ date: "13", value: 7 });
        expect(out[0].value).toBe(0);
        expect(formatHour("13")).toBe("13:00");
    });
});
