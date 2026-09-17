import { describe, it, expect } from "vitest";
import { formatPendingChangeLabel } from "@/pages/Business/pendingChangeLabel";

describe("formatPendingChangeLabel — «Prossimo cambio» (passo 4b)", () => {
    it("names the billing interval whenever it is known", () => {
        expect(formatPendingChangeLabel({ planName: "Pro", seats: 1, interval: "month", dateLabel: "17 settembre 2027" }))
            .toBe("Pro · 1 sede · fatturazione mensile dal 17 settembre 2027");
        expect(formatPendingChangeLabel({ planName: "Base", seats: 3, interval: "year", dateLabel: "1 gennaio 2027" }))
            .toBe("Base · 3 sedi · fatturazione annuale dal 1 gennaio 2027");
    });

    it("falls back to the legacy plan · seats form when the interval is unknown", () => {
        expect(formatPendingChangeLabel({ planName: "Base", seats: 2, interval: null, dateLabel: "17 ottobre 2026" }))
            .toBe("Base · 2 sedi dal 17 ottobre 2026");
    });
});
